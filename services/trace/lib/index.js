/* eslint-disable space-before-function-paren */
const CampsiService = require('../../../lib/service');
const handlers = require('./handlers');

module.exports = class TraceService extends CampsiService {
  initialize() {
    const service = this;

    this.router.use('/', (req, res, next) => {
      req.service = service;
      next();
    });
    this.router.all('*', handlers.traceRequest);
    return new Promise(resolve => {
      resolve();
    });
  }

  describe() {
    const desc = super.describe();
    return desc;
  }

  // comment something
  // comment something else
  // keep thoise comments coming
  // fix
  // feature
};
