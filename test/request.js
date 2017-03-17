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
const expect        = require('chai').expect;
const schema        = require('../bin/server/schemas').request;

describe('request', () => {

    describe('schema', () => {

        it('cannot be null', () => {
            expect(() => schema.validate(null)).to.throw(Error);
        });

        it('cannot be undefined', () => {
            expect(() => schema.validate()).to.throw(Error);
        });

        it('can be an empty object', () => {
            expect(() => schema.validate({})).not.to.throw(Error);
        });

        describe('body', () => {

            it('can be null', () => {
                expect(() => schema.validate({ body: null })).not.to.throw(Error);
            });

            it('can be object', () => {
                expect(() => schema.validate({ body: {} })).not.to.throw(Error);
            });

            it('can be string', () => {
                expect(() => schema.validate({ body: '' })).not.to.throw(Error);
            });

            it('cannot be number', () => {
                expect(() => schema.validate({ body: 1 })).to.throw(Error);
            });

        });

        describe('headers', () => {

            it('can be null', () => {
                expect(() => schema.validate({ headers: null })).not.to.throw(Error);
            });

            it('null transforms to object', () => {
                expect(schema.normalize({ headers: null }).headers).to.deep.equal({});
            });

            it('can be object', () => {
                expect(() => schema.validate({ headers: {} })).not.to.throw(Error);
            });

            it('can be object with strings', () => {
                expect(() => schema.validate({ headers: { foo: 'bar' } })).not.to.throw(Error);
            });

            it('can be object with numbers', () => {
                expect(() => schema.validate({ headers: { foo: 1 } })).to.throw(Error);
            });

            it('cannot be number', () => {
                expect(() => schema.validate({ headers: 1 })).to.throw(Error);
            });

        });

        describe('query', () => {

            it('can be null', () => {
                expect(() => schema.validate({ query: null })).not.to.throw(Error);
            });

            it('can be object with strings', () => {
                expect(() => schema.validate({ query: { foo: 'bar' } })).not.to.throw(Error);
            });

            it('can be object with empty array', () => {
                expect(() => schema.validate({ query: { foo: [] } })).not.to.throw(Error);
            });

            it('can be object with array of string', () => {
                expect(() => schema.validate({ query: { foo: ['bar', 'baz'] } })).not.to.throw(Error);
            });

        });

    });

});