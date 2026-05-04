/**
 * TuguPIM — Engine Unit Tests
 *
 * Run from the browser console:
 *   import('/test/engine.test.js')
 */

import { calculate, getEffectivePrice } from '../src/core/engine.js';

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

async function testCostBase() {
  console.group('1. Cost Base Calculation');

  const p1 = { costMaterial: 10, costLabor: 5, costPackaging: 2.5 };
  const res1 = await calculate(p1);
  assert('Sum of material, labor, and packaging', res1.costBase === 17.5, res1.costBase);

  const p2 = { costMaterial: '10.50', costLabor: '5.25' };
  const res2 = await calculate(p2);
  assert('Handles numeric strings and missing fields', res2.costBase === 15.75, res2.costBase);

  const p3 = {};
  const res3 = await calculate(p3);
  assert('Handles empty object (defaults to 0)', res3.costBase === 0, res3.costBase);

  console.groupEnd();
}

async function testTransferPrice() {
  console.group('2. Transfer Price Calculation');

  const p1 = {
    costMaterial: 10, costLabor: 5, costPackaging: 5, // base = 20
    adminTaxPct: 10,        // 20 * 1.1 = 22
    adminLogisticsCost: 2,  // 22 + 2 = 24
    adminMarketingCost: 3,  // 24 + 3 = 27
    adminMiscCost: 1,       // 27 + 1 = 28
    adminMarginPct: 50,     // 28 * 1.5 = 42
  };
  const res1 = await calculate(p1);
  assert('Full admin layer pipeline', res1.transferPrice === 42, res1.transferPrice);

  const p2 = { costMaterial: 10, adminMarginPct: null };
  const res2 = await calculate(p2);
  assert('Returns null if adminMarginPct is missing', res2.transferPrice === null, res2.transferPrice);

  const p3 = { costMaterial: 10, adminMarginPct: 0 };
  const res3 = await calculate(p3);
  assert('Works with 0% margin', res3.transferPrice === 10, res3.transferPrice);

  console.groupEnd();
}

function testEffectivePrice() {
  console.group('3. Effective Price (Campaigns)');

  const product = { sellingPrice: 100 };
  const now = Date.now();

  assert('No campaign: returns sellingPrice',
    getEffectivePrice(product, null) === 100);

  const c1 = { isActive: true, discountType: 'PERCENTAGE', discountValue: 20 };
  assert('Percentage discount (20%)',
    getEffectivePrice(product, c1) === 80);

  const c2 = { isActive: true, discountType: 'FIXED', discountValue: 15 };
  assert('Fixed discount (15)',
    getEffectivePrice(product, c2) === 85);

  const c3 = { isActive: false, discountType: 'PERCENTAGE', discountValue: 50 };
  assert('Inactive campaign: ignored',
    getEffectivePrice(product, c3) === 100);

  const c4 = { isActive: true, discountType: 'FIXED', discountValue: 150 };
  assert('Discount cannot result in negative price',
    getEffectivePrice(product, c4) === 0);

  const c5 = { isActive: true, discountType: 'PERCENTAGE', discountValue: 10, startsAt: now + 10000 };
  assert('Future campaign: ignored',
    getEffectivePrice(product, c5) === 100);

  const c6 = { isActive: true, discountType: 'PERCENTAGE', discountValue: 10, endsAt: now - 10000 };
  assert('Expired campaign: ignored',
    getEffectivePrice(product, c6) === 100);

  console.groupEnd();
}

async function run() {
  console.group('%cTuguPIM — Engine Tests', 'font-weight:bold; font-size:14px');
  await testCostBase();
  await testTransferPrice();
  testEffectivePrice();

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
