/* eslint-disable node/no-unpublished-require */
const config = require('config');
const async = require('async');
const debug = require('debug')('migrate');
const { MongoClient } = require('mongodb');
// CLI
const args = Array.from(process.argv).splice(2);
const options = { services: [], params: [] };
/* istanbul ignore if  */
if (!module.parent) {
  args.forEach(arg => options[arg.startsWith('--') ? 'params' : 'services'].push(arg));
  const collections = options.services.reduce((collections, service) => {
    const resourcesNames = Object.keys(config.services[service].options.resources);
    return collections.concat(resourcesNames.map(resourceName => `docs.${service}.${resourceName}`));
  }, []);
  const mongoUri = config.campsi.mongo.uri;
  MongoClient.connect(mongoUri, (err, client) => {
    if (err) throw err;
    const db = client.db(config.campsi.mongo.database);
    migrate(options.params, db, collections);
  });
}

function migrate(params, db, collections, done) {
  async.forEachSeries(
    collections,
    (collection, cb) => {
      debug('migrate collection', collection);
      updateCollection(params, db, collection, cb);
    },
    () => {
      debug('migration complete');
      if (typeof done === 'function') {
        done();
      }
    }
  );
}

async function updateCollection(params, db, collection, done) {
  const filter = { ownedBy: { $exists: true } };
  if (!params.includes('--all-docs')) {
    filter.users = { $exists: false };
  }
  try {
    const cursor = await db.collection(collection).find(filter, { projection: { ownedBy: 1, _id: 1 } });
    let cursorHasNext = true;
    const updateDocument = (doc, cb) => {
      if (doc === null) {
        debug('document is null');
        return cb();
      }
      const ops = {
        $set: {
          users: { [doc.ownedBy]: { roles: ['owner'], userId: doc.ownedBy } }
        }
      };
      if (params.includes('--remove-ownedBy')) {
        ops.$unset = { ownedBy: 1 };
      }
      db.collection(collection).updateOne({ _id: doc._id }, ops, (err, result) => {
        err ? debug('an error occured during the update', err) : debug(collection, doc._id, 'nModified', result.modifiedCount);
        cursor.hasNext((err, hasNext) => {
          /* istanbul ignore if  */
          if (err) debug('error occured while fetching hasNext() information', err);
          cursorHasNext = hasNext;
          cb();
        });
      });
    };
    cursor.hasNext((err, hasNext) => {
      /* istanbul ignore if  */
      if (err) {
        debug('error occured while fetching hasNext() information', err);
        return done();
      }
      cursorHasNext = hasNext;
      if (!cursorHasNext) {
        debug(collection, 'has no element');
      }
      async.whilst(
        () => cursorHasNext,
        cb => {
          cursor.next((err, doc) => {
            /* istanbul ignore if  */
            if (err) {
              debug('error occured while fetching next() element', err);
              cursorHasNext = false;
              return cb();
            }
            updateDocument(doc, cb);
          });
        },
        done
      );
    });
  } catch (err) {
    return debug(`an error occured during the find() from collection ${collection}`, err);
  }
}

module.exports = migrate;
