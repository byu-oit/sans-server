/**
 *  @license
 *    Copyright 2016 Brigham Young University
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 **/
'use strict';
const EventEmitter          = require('events');
const httpMethods           = require('./schemas').server.httpMethods;
const httpStatus            = require('http-status');
const Middleware            = require('sans-server-middleware');
const Response              = require('./response');
const util                  = require('../util');
const uuid                  = require('../uuid');

const STORE = Symbol('store');

module.exports = Request;

/**
 * Generate a request instance.
 * @param {SansServer} server
 * @param {object} keys
 * @param {boolean} rejectable
 * @param {string|Object} [config] A string representing the path or a configuration representing all properties
 * to accompany the request.
 * @returns {Request}
 * @constructor
 * @augments {EventEmitter}
 * @augments {Promise}
 */
function Request(server, keys, rejectable, config) {
    if (!(this instanceof Request)) return new Request(server, keys, rejectable, config);
    if (!config) config = {};
    if (typeof config !== 'object') config = { path: config };

    const promise = new Promise((resolve, reject) => {
        let fulfilled = false;

        this.on('res-complete', () => {
            if (fulfilled) {
                req.log('fulfilled', 'Request already fulfilled');
            } else {
                fulfilled = true;
                req.log('fulfilled', 'Request fulfilled');
                resolve(res.state);
            }
        });

        this.on('error', err => {
            req.log('error', err.stack.replace(/\n/g, '\n  '), err);
            if (fulfilled) {
                req.log('fulfilled', 'Request already fulfilled');
            } else if (rejectable) {
                fulfilled = true;
                req.log('fulfilled', 'Request fulfilled');
                reject(err);
            } else {
                res.reset().set('content-type', 'text/plain').status(500).body(httpStatus[500]);
                resolve(res.state);
            }
        });
    });

    // set private store
    this[STORE] = {
        hooks: {}
    };

    // initialize variables
    const req = this;
    const res = Response(this, keys.response);
    const pendingLogs = [];

    // validate and normalize input
    Object.assign(this, config, normalize(pendingLogs, config));

    /**
     * The request body.
     * @name Request#body
     * @type {string|Object|Buffer|undefined}
     */

    /**
     * The request headers. This is an object that has lower-case keys and string values.
     * @name Request#headers
     * @type {Object<string,string>}
     */

    /**
     * This request method. The lower case equivalents of these value are acceptable but will be automatically lower-cased.
     * @name Request#method
     * @type {string} One of: 'GET', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'
     */

    /**
     * The request path, beginning with a '/'. Does not include domain or query string.
     * @name Request#path
     * @type {string}
     */

    /**
     * An object mapping query parameters by key.
     * @name Request#query
     * @type {object<string,string>}
     */

    /**
     * Get the unique ID associated with this request.
     * @name Request#id
     * @type {string}
     * @readonly
     */
    Object.defineProperty(this, 'id', {
        configurable: false,
        enumerable: true,
        value: uuid()
    });

    /**
     * Get the response object that is tied to this request.
     * @name Request#res
     * @type {Response}
     */
    Object.defineProperty(this, 'res', {
        configurable: false,
        enumerable: true,
        value: res
    });

    /**
     * Get the server instance that initialized this request.
     * @name Request#server
     * @type {SansServer}
     */
    Object.defineProperty(this, 'server', {
        enumerable: true,
        configurable: false,
        value: server
    });

    /**
     * Get the request URL which consists of the path and the query parameters.
     * @name Request#url
     * @type {string}
     * @readonly
     */
    Object.defineProperty(this, 'url', {
        configurable: false,
        enumerable: true,
        get: () => this.path + buildQueryString(this.query)
    });

    /**
     * Add a rejection handler to the request promise.
     * @name Request#catch
     * @param {Function} onRejected
     * @returns {Promise}
     */
    this.catch = onRejected => promise.catch(onRejected);

    /**
     * @name Request#hook.run
     * @param {string} type
     * @param {function} next
     * @returns {Promise|undefined}
     */
    this.hook.reverse = runHooksMode.bind(this, 'reverse');

    /**
     * @name Request#hook.run
     * @param {string} type
     * @param {function} next
     * @returns {Promise|undefined}
     */
    this.hook.run = runHooksMode.bind(this, 'run');

    /**
     * Add fulfillment or rejection handlers to the request promise.
     * @name Request#then
     * @param {Function} onFulfilled
     * @param {Function} [onRejected]
     * @returns {Promise}
     */
    this.then = (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected);

    // wait one tick for any event listeners to be added
    process.nextTick(() => {

        // log pending logs
        pendingLogs.forEach(message => {
            req.log('warning', message, config);
        });

        // run request hooks
        this.hook.run(keys.request)
            .then(() => {
                if (!res.sent) {
                    req.log('unhandled', 'request not handled');
                    if (res.state.statusCode === 0) {
                        res.sendStatus(404);
                    } else {
                        res.send();
                    }
                }
            })
            .catch(err => {
                this.emit('error', err)
            });
    });
}

Request.prototype = Object.create(EventEmitter.prototype);
Request.prototype.name = 'Request';
Request.prototype.constructor = Request;

/**
 * Add request specific hooks
 * @param {string} type
 * @param {number} [weight=0]
 * @param {...Function} hook
 * @returns {Request}
 */
Request.prototype.hook = function(type, weight, hook) {
    const length = arguments.length;
    const hooks = this[STORE].hooks;
    let start = 1;

    if (typeof type !== 'string') {
        const err = Error('Expected first parameter to be a string. Received: ' + type);
        err.code = 'ESHOOK';
        throw err;
    }

    // handle variable input parameters
    if (typeof arguments[1] === 'number') {
        start = 2;
    } else {
        weight = 0;
    }

    if (!hooks[type]) hooks[type] = [];
    const store = hooks[type];
    for (let i = start; i < length; i++) {
        const hook = arguments[i];
        if (typeof hook !== 'function') {
            const err = Error('Expected last parameter(s) to be a function. Received: ' + hook);
            err.code = 'ESHOOK';
            throw err;
        }

        const event = { weight: weight, hook: arguments[i] };
        store.push(event);
        this.emit('hook-add-' + type, event);
    }
    return this;
};

/**
 * Produce a log event.
 * @param {string} [type='log']
 * @param {string} message
 * @param {Object} [details]
 * @returns {Request}
 * @fires Request#log
 */
Request.prototype.log = function(type, message, details) {

    /**
     * A log event.
     * @event Request#log
     * @type {LogEvent}
     */
    this.emit('log', util.log('request', arguments));
    return this;
};

/**
 * This constructor has double inheritance.
 * @param {*} instance
 * @returns {boolean}
 */
Object.defineProperty(Request, Symbol.hasInstance, {
    enumerable: false,
    configurable: true,
    value: function(instance) {
        return instance instanceof EventEmitter
            || instance instanceof Promise;
    }
});


function buildQueryString(query) {
    const results = Object.keys(query).reduce(function(ar, key) {
        const value = query[key];
        if (Array.isArray(value)) {
            value.forEach(value => ar.push(key + (typeof value === 'string' ? '=' + value : '')));
        } else {
            ar.push(key + (typeof value === 'string' ? '=' + value : ''));
        }
        return ar;
    }, []);
    return results.length > 0 ? '?' + results.join('&') : '';
}

function extractQueryParamsFromString(store, str) {
    str.split('&')
        .forEach(pair => {
            const kv = pair.split('=');
            const key = kv[0];
            const value = kv[1] === undefined ? true : kv[1];
            if (Array.isArray(store[key])) {
                store[key].push(value);
            } else if (store.hasOwnProperty(key)) {
                store[key] = [store[key], value];
            } else {
                store[key] = value;
            }
        });
}

function normalize(pendingLogs, config) {
    const normal = {};

    // validate and normalize body
    normal.body = '';
    if (config.hasOwnProperty('body')) normal.body = util.copy(config.body);

    // validate and normalize headers
    normal.headers = {};
    if (config.hasOwnProperty('headers')) {
        let err = false;
        if (!config.headers || typeof config.headers !== 'object') {
            pendingLogs.push('Request headers expected object. Received: ' + config.headers);
        } else {
            Object.keys(config.headers).forEach(key => {
                let value = config.headers[key];
                if (typeof value !== 'string') {
                    err = pendingLogs.push('Request header value expected a string for key: ' + key + '. Received: ' + value);
                    value = String(value);
                }
                normal.headers[key.toLowerCase()] = value;
            });
        }
    }

    // validate and normalize method
    normal.method = 'GET';
    if (config.hasOwnProperty('method')) {
        const method = typeof config.method !== 'string' ? null : config.method.toUpperCase();
        if (httpMethods.indexOf(method) === -1) {
            pendingLogs.push('Request method expected one of (case-insensitive): ' + httpMethods.join(', ') + '. Received: ' + config.method);
        } else {
            normal.method = method;
        }
    }

    // validate and normalize query
    normal.query = {};
    if (config.hasOwnProperty('query')) {
        const type = typeof config.query;
        if (type === 'string') {
            extractQueryParamsFromString(normal.query, config.query.replace(/^\?/, ''));
        } else if (config.query && type === 'object') {
            Object.keys(config.query).forEach(key => {
                const value = config.query[key];
                if (Array.isArray(value)) {
                    normal.query[key] = [];
                    value.forEach((v, i) => {
                        if (v === true || typeof v === 'string') {
                            normal.query[key].push(v);
                        } else {
                            pendingLogs.push('Request query expects value to be a string or true for property ' + key +
                                ' at index ' + i + '. Received: ' + v);
                            normal.query[key].push(String(v));
                        }
                    });
                } else if (value === true || typeof value === 'string') {
                    normal.query[key] = value;

                } else {
                    pendingLogs.push('Request query expects value to be a string or true for property ' + key + '. Received: ' + value);
                    normal.query[key] = String(value);
                }
            });
        } else {
            pendingLogs.push('Request query expected a string or non-null object. Received: ' + config.query);
        }
    }

    // validate path and extract any query parameters
    normal.path = '';
    if (config.hasOwnProperty('path')) {
        if (typeof config.path !== 'string') {
            pendingLogs.push('Request path expected a string. Received: ' + config.path);
        } else {
            const parts = config.path.split('?');
            normal.path = parts[0];
            if (parts[1]) extractQueryParamsFromString(normal.query, parts[1]);
        }
    }

    return normal;
}

function runHooksMode(mode, symbol, next) {
    const hooks = this[STORE].hooks;
    let promise;

    // get the hook type from the symbol
    const type = this.server.hook.type(symbol);
    if (!type) {
        const err = Error('Hook type not defined: ' + symbol);
        err.code = 'ESHOOK';
        if (next) {
            next(err);
            return;
        } else {
            return Promise.reject(err);
        }
    }

    // run the hooks
    if (hooks[type]) {
        const middleware = new Middleware(type);
        hooks[type].forEach(item => {
            middleware.add(item.weight, item.hook);
        });
        promise = middleware[mode](this, this.res);
    } else {
        promise = Promise.resolve();
    }

    if (next) {
        promise.then(() => next(), next);
    } else {
        return promise;
    }
}