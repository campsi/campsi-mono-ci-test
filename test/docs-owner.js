//During the test the env variable is set to private
process.env.NODE_CONFIG_DIR = './test/config';
process.env.NODE_ENV = 'test';

//Require the dev-dependencies
const {MongoClient} = require('mongodb');
const debug = require('debug')('campsi:test');
const chai = require('chai');
const chaiHttp = require('chai-http');
const format = require('string-format');
const CampsiServer = require('campsi');
const config = require('config');
const builder = require('../lib/modules/queryBuilder');
const fakeId = require('fake-object-id');

chai.should();
let expect = chai.expect;
let campsi;
let server;
format.extend(String.prototype);
chai.use(chaiHttp);

const services = {
    Docs: require('../lib'),
};

let me = {
    _id: fakeId()
};
let not_me = {
    _id: fakeId()
};

// Helpers
function createPizza(data, owner, state) {
    return new Promise(function (resolve, reject) {
        let resource = campsi.services.get('docs').options.resources['pizzas'];
        builder.create({
            user: owner,
            data: data,
            resource: resource,
            state: state
        }).then((doc) => {
            resource.collection.insert(doc, (err, result) => {
                resolve(result.ops[0]._id);
            });
        }).catch((error) => {
            reject(error);
        });
    });

}

// Our parent block
describe('Docs - Owner', () => {
    beforeEach((done) => {

        // Empty the database
        MongoClient.connect(config.campsi.mongoURI).then((db) => {
            db.dropDatabase(() => {
                db.close();
                campsi = new CampsiServer(config.campsi);
                campsi.mount('docs', new services.Docs(config.services.docs));
                campsi.app.use((req, res, next) => {
                    req.user = me;
                    next();
                });

                campsi.on('campsi/ready', () => {
                    server = campsi.listen(config.port);
                    done();
                });

                campsi.start()
                    .catch((err) => {
                        debug('Error: %s', err);
                    });
            });
        });
    });

    afterEach((done) => {
        server.close();
        done();
    });

    /*
     * Test owner role
     */
    describe('owner role', () => {
        it('it should create a doc with correct owner', (done) => {
            let data = {'name': 'test'};
            chai.request(campsi.app)
                .post('/docs/pizzas/working_draft')
                .set('content-type', 'application/json')
                .send(data)
                .end((err, res) => {
                    res.should.have.status(200);
                    res.should.be.json;
                    res.body.should.be.a('object');
                    res.body.state.should.be.eq('working_draft');
                    res.body.should.have.property('id');
                    res.body.should.have.property('createdAt');
                    res.body.should.have.property('createdBy');
                    expect(res.body.createdBy).to.be.eql(me._id);
                    res.body.should.have.property('data');
                    res.body.data.should.be.eql(data);
                    done();
                });
        });
        it('it should not get a document not owned by current user', (done) => {
            let data = {'name': 'test'};
            createPizza(data, not_me, 'archived').then((id) => {
                chai.request(campsi.app)
                    .get('/docs/pizzas/{0}/archived'.format(id))
                    .end((err, res) => {
                        res.should.have.status(403);
                        done();
                    });
            });
        });
        it('it should get a document owned by current user', (done) => {
            let data = {'name': 'test'};
            createPizza(data, me, 'archived').then((id) => {
                chai.request(campsi.app)
                    .get('/docs/pizzas/{0}/archived'.format(id))
                    .end((err, res) => {
                        //TODO : res.should.have.status(200);
                        done();
                    });
            });
        });
    });
});
