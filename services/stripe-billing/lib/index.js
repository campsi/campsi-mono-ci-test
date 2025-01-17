/* eslint-disable no-prototype-builtins */
const CampsiService = require('../../../lib/service');
const helpers = require('../../../lib/modules/responseHelpers');

const subscriptionExpand = ['latest_invoice', 'latest_invoice.payment_intent', 'pending_setup_intent'];
const customerExpand = ['tax_ids'];

const buildExpandFromBody = (body, defaultExpand) => {
  return body.expand && typeof body.expand === 'string'
    ? [...new Set([...defaultExpand, ...body.expand.split('|')])]
    : defaultExpand;
};

const buildExpandFromQuery = (query, defaultExpand) => {
  return [...new Set([...defaultExpand, ...(query?.expand?.split('|') || [])])].join('|');
};

const bodyToCustomer = (body, sourcePropertyName, user) => {
  return {
    name: String(body.name),
    description: String(body.description),
    source: body.source,
    [sourcePropertyName]: body.default_source,
    email: body.email?.toLowerCase(),
    invoice_prefix: body.invoice_prefix,
    tax_id_data: body.tax_id_data,
    tax_exempt: body.tax_exempt || 'none',
    address: body.address,
    metadata: Object.assign(body.metadata || {}, user ? { user: user._id.toString() } : {}),
    shipping: body.shipping,
    preferred_locales: [...new Set(['fr-FR', ...(body.preferred_locales ?? [])])],
    expand: buildExpandFromBody(body, customerExpand)
  };
};

const optionsFromQuery = query => {
  const options = {};
  if (query.expand) {
    options.expand = query.expand.split('|');
  }
  return options;
};

const defaultHandler = res => (err, obj) => {
  if (err) {
    helpers.error(res, err);
    console.error(err);
  } else {
    helpers.json(res, obj);
  }
};

module.exports = class StripeBillingService extends CampsiService {
  initialize() {
    this.stripe = require('stripe')(this.options.secret_key);
    const stripe = this.stripe;

    this.router.use((req, res, next) => {
      req.service = this;
      next();
    });

    this.router.post('/webhook', (req, res) => {
      res.send('OK');
      this.emit('webhook', req.body);
    });

    this.router.post('/customers', (req, res) => {
      stripe.customers.create(bodyToCustomer(req.body, 'source', req.user), defaultHandler(res));
    });

    this.router.get('/customers/:id', (req, res) => {
      req.query.expand = buildExpandFromQuery(req.query, customerExpand);
      stripe.customers.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });

    this.router.put('/customers/:id', (req, res) => {
      stripe.customers.update(req.params.id, bodyToCustomer(req.body, 'default_source'), defaultHandler(res));
    });

    this.router.patch('/customers/:id', (req, res) => {
      req.body.expand = buildExpandFromBody(req.body, customerExpand);
      stripe.customers.update(req.params.id, req.body, defaultHandler(res));
    });

    this.router.delete('/customers/:id', (req, res) => {
      stripe.customers.del(req.params.id, defaultHandler(res));
    });

    this.router.get('/customers/:customer/invoices', (req, res) => {
      stripe.invoices.list(Object.assign({ customer: req.params.customer }, optionsFromQuery(req.query)), defaultHandler(res));
    });

    this.router.post('/customers/:customer/tax_ids', (req, res) => {
      stripe.customers.createTaxId(req.params.customer, { type: req.body.type, value: req.body.value }, defaultHandler(res));
    });

    this.router.post('/customers/:customer/sources', (req, res) => {
      stripe.customers.createSource(req.params.customer, { source: req.body.source }, defaultHandler(res));
    });

    this.router.delete('/customers/:customer/sources/:id', (req, res) => {
      stripe.customers.deleteSource(req.params.customer, req.params.id, defaultHandler(res));
    });

    this.router.delete('/customers/:customer/tax_ids/:id', (req, res) => {
      stripe.customers.deleteTaxId(req.params.customer, req.params.id, defaultHandler(res));
    });

    this.router.post('/subscriptions', (req, res) => {
      stripe.subscriptions.create(
        {
          customer: req.body.customer,
          collection_method: 'charge_automatically',
          items: req.body.items,
          metadata: req.body.metadata,
          coupon: req.body.coupon,
          promotion_code: req.body.promotion_code,
          expand: buildExpandFromBody(req.body, subscriptionExpand),
          default_tax_rates: req.body.default_tax_rates,
          default_source: req.body.default_source
        },
        defaultHandler(res)
      );
    });

    this.router.get('/subscriptions/:id', (req, res) => {
      req.query.expand = buildExpandFromQuery(req.query, subscriptionExpand);
      stripe.subscriptions.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });

    this.router.delete('/subscriptions/:id', (req, res) => {
      const params = {};
      if (req.body.invoice_now) {
        params.invoice_now = req.body.invoice_now;
      }
      stripe.subscriptions.del(req.params.id, params, defaultHandler(res));
    });

    this.router.put('/subscriptions/:id', (req, res) => {
      stripe.subscriptions.update(
        req.params.id,
        {
          collection_method: 'charge_automatically',
          items: req.body.items,
          metadata: req.body.metadata,
          coupon: req.body.coupon,
          promotion_code: req.body.promotion_code,
          expand: buildExpandFromBody(req.body, subscriptionExpand),
          default_tax_rates: req.body.default_tax_rates,
          default_source: req.body.default_source
        },
        defaultHandler(res)
      );
    });

    this.router.patch('/subscriptions/:id', (req, res) => {
      req.body.expand = buildExpandFromBody(req.body, subscriptionExpand);
      stripe.subscriptions.update(req.params.id, req.body, defaultHandler(res));
    });

    this.router.get('/sources/:id', (req, res) => {
      stripe.sources.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });

    this.router.get('/invoices/:id', (req, res) => {
      stripe.invoices.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });

    this.router.post('/setup_intents', (req, res) => {
      stripe.setupIntents.create(
        {
          confirm: true,
          payment_method: req.body.payment_method,
          customer: req.body.customer,
          payment_method_types: ['card', 'sepa_debit'],
          metadata: req.body.metadata
        },
        defaultHandler(res)
      );
    });
    this.router.get('/coupons/:code[:]check-validity', this.checkCouponCodeValidity);

    this.router.get('/payment_intents/:id', (req, res) => {
      stripe.paymentIntents.retrieve(req.params.id, optionsFromQuery(req.query), defaultHandler(res));
    });
    this.router.post('/payment_intents/:id[:]confirm', (req, res) => {
      stripe.paymentIntents.confirm(req.params.id, defaultHandler(res));
    });
    this.router.post('/payment_intents', (req, res) => {
      const payload = {
        confirm: req.body.confirm || true,
        amount: req.body.amount,
        currency: req.body.currency || 'eur',
        payment_method_types: ['card', 'sepa_debit'],
        setup_future_usage: req.body.setup_future_usage || 'off_session',
        customer: req.body.customer
      };
      if (req.body.payment_method) {
        payload.payment_method = req.body.payment_method;
      }
      stripe.paymentIntents.create(payload, defaultHandler(res));
    });
    this.router.patch('/payment_intents/:id', (req, res) => {
      const payload = {
        setup_future_usage: req.body.setup_future_usage || 'off_session'
      };
      if (req.body.payment_method) {
        payload.payment_method = req.body.payment_method;
      }
      if (req.body.metadata) {
        payload.metadata = req.body.metadata;
      }
      stripe.paymentIntents.update(req.params.id, payload, defaultHandler(res));
    });

    return super.initialize();
  }

  fetchSubscription(subscriptionId, cb) {
    this.stripe.subscriptions.retrieve(subscriptionId, cb);
  }

  /**
   * @see https://stripe.com/docs/api/invoices/list
   * @param {Object} parameters can be customer, subscription, status... ex: { customer: 'cus_abc123' }
   * @return {Object}
   */
  // eslint-disable-next-line
  fetchInvoices = async parameters => {
    const invoices = [];
    parameters = { ...parameters, limit: 100 };
    for await (const invoice of this.stripe.invoices.list(parameters)) {
      invoices.push(invoice);
    }
    return invoices;
  };

  /**
   * @see https://stripe.com/docs/api/credit_notes/list
   * @param {Object} parameters can be customer, invoice... ex: { customer: 'cus_abc123' }
   * @return {Object}
   */
  // eslint-disable-next-line
  fetchCreditNotes = async parameters => {
    const creditNotes = [];
    parameters = { ...parameters, limit: 100 };
    for await (const creditNote of this.stripe.creditNotes.list(parameters)) {
      creditNotes.push(creditNote);
    }
    return creditNotes;
  };

  // eslint-disable-next-line
  checkCouponCodeValidity = async (req, res) => {
    const code = req.params.code;
    if (!code) {
      return helpers.missingParameters(res, new Error('code must be specified'));
    }

    const promoCodes = await this.stripe.promotionCodes.list({
      limit: 1,
      active: true,
      code
    });

    if (promoCodes.data.length) {
      return res.json(promoCodes.data[0]);
    }
    // no promocode => let's find if there's a valid coupon with code as its id
    try {
      const coupon = await this.stripe.coupons.retrieve(code);
      if (!coupon.valid) {
        return helpers.badRequest(res, new Error(`invalid code ${code}`));
      }
      return res.json(coupon);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ message: err.raw?.message || `invalid code ${code}` });
    }
  };

  /**
   * @see https://stripe.com/docs/api/usage_records/create
   * @param {string} subscriptionItemId
   * @param {Object} params default action: set
   * @return {Object}
   */
  async createUsageRecord(subscriptionItemId, params) {
    if (!params || typeof params !== 'object') {
      throw new Error('You must provide a params object');
    }
    if (!params.hasOwnProperty('quantity') || !Number.isInteger(parseInt(params.quantity))) {
      throw new Error('You must provide proper quantity');
    }
    params.action = params.action ?? 'set';
    params.quantity = parseInt(params.quantity);
    return await this.stripe.subscriptionItems.createUsageRecord(subscriptionItemId, params);
  }

  /**
   * @see https://stripe.com/docs/api/usage_records/subscription_item_summary_list
   * @param {string} subscriptionItemId
   * @param {Object} params
   * @return {array}
   */
  async listUsageRecordSummaries(subscriptionItemId, params = {}) {
    const usageSummary = [];
    for await (const usage of this.stripe.subscriptionItems.listUsageRecordSummaries(subscriptionItemId, {
      limit: 100,
      ...params
    })) {
      usageSummary.push(usage);
    }
    return usageSummary;
  }
};
