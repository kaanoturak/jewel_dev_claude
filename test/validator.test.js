/**
 * TuguPIM — Validator Unit Tests
 *
 * Run from the browser console:
 *   import('/test/validator.test.js')
 */

import { validate, PRODUCT_SCHEMA, VARIANT_SCHEMA } from '../src/core/validator.js';

let _passed = 0;
let _failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS  ${label}`);
    _passed++;
  } else {
    console.error(`  ❌ FAIL  ${label}${detail ? `  (${detail})` : ''}`);
    _failed++;
  }
}

function testRequired() {
  console.group('1. Required Rule');

  const schema = { name: [{ rule: 'required', message: 'Err' }] };

  assert('Passes when value present', validate(schema, { name: 'A' }).valid);
  assert('Fails when value null',    !validate(schema, { name: null }).valid);
  assert('Fails when value empty',   !validate(schema, { name: '' }).valid);
  assert('Fails when key missing',   !validate(schema, {}).valid);

  console.groupEnd();
}

function testNumericRules() {
  console.group('2. Numeric Rules (min, max, gt, integer)');

  const schema = {
    age: [
      { rule: 'integer', message: 'Must be int' },
      { rule: 'min', value: 18, message: 'Too young' },
      { rule: 'max', value: 99, message: 'Too old' }
    ],
    price: [
      { rule: 'gt', value: 0, message: 'Must be positive' }
    ]
  };

  assert('Valid integer in range', validate(schema, { age: 25, price: 10 }).valid);
  assert('Fails non-integer',     !validate(schema, { age: 25.5 }).valid);
  assert('Fails below min',       !validate(schema, { age: 17 }).valid);
  assert('Fails above max',       !validate(schema, { age: 100 }).valid);
  assert('Fails gt 0 (is 0)',     !validate(schema, { price: 0 }).valid);
  assert('Passes gt 0 (is 0.1)',   validate(schema, { price: 0.1 }).valid);

  console.groupEnd();
}

function testStringRules() {
  console.group('3. String Rules (minLength, maxLength)');

  const schema = {
    code: [
      { rule: 'minLength', value: 3, message: 'Short' },
      { rule: 'maxLength', value: 5, message: 'Long' }
    ]
  };

  assert('Valid length', validate(schema, { code: 'ABC' }).valid);
  assert('Too short',    !validate(schema, { code: 'AB' }).valid);
  assert('Too long',     !validate(schema, { code: 'ABCDEF' }).valid);

  console.groupEnd();
}

function testProductSchema() {
  console.group('4. Product Schema (Real Data)');

  const validProduct = {
    name: 'Test Ring',
    category: 'Ring',
    material: 'Gold',
    seoTitle: 'Valid SEO Title',
    seoDescription: 'A description of the product for search engines.',
    marketingDescription: 'This is a long enough marketing description to pass the fifty character limit.',
    productDescription: 'This is an even longer product description that should easily pass the one hundred character minimum length requirement.',
    images: ['img1.jpg']
  };

  const res = validate(PRODUCT_SCHEMA, validProduct);
  assert('Valid product passes', res.valid, JSON.stringify(res.errors));

  const invalidProduct = { ...validProduct, name: 'A', category: 'Invalid' };
  const res2 = validate(PRODUCT_SCHEMA, invalidProduct);
  assert('Invalid name and category fails', !res2.valid);
  assert('Error for name length', res2.errors.name.length > 0);
  assert('Error for category enum', res2.errors.category.length > 0);

  console.groupEnd();
}

async function run() {
  console.group('%cTuguPIM — Validator Tests', 'font-weight:bold; font-size:14px');
  testRequired();
  testNumericRules();
  testStringRules();
  testProductSchema();

  const total = _passed + _failed;
  console.log('─'.repeat(44));
  if (_failed === 0) {
    console.log(`%c✅  All ${total} checks passed`, 'color:#22c55e; font-weight:bold');
  } else {
    console.log(`%c❌  ${_failed} of ${total} checks failed`, 'color:#ef4444; font-weight:bold');
  }
  console.groupEnd();
}

run();
