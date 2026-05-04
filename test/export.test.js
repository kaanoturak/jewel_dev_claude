/**
 * TuguPIM — Export Unit Tests
 *
 * Run from the browser test runner:
 *   /test/browser-runner.html
 */

import { toShopifyCSV, toJSONFeed, toJsonLD } from '../src/modules/export/index.js';

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

function csvRows(csv) {
  return csv.split('\r\n').map(row => row.split(','));
}

function testVariantPricingExports() {
  console.group('1. Per-Variant Pricing Exports');

  const product = {
    id: 'p-1',
    sku: 'TGJ-RNG-BRS-00001',
    name: 'Variant Ring',
    status: 'READY_FOR_ECOMMERCE',
    category: 'Ring',
    vendorId: 'vendor-a',
    sellingPrice: 100,
    compareAtPrice: 130,
    variantPricingEnabled: true,
  };

  const variants = [
    { variantId: 'v-1', productId: 'p-1', sku: 'SKU-S', sellingPrice: 80, compareAtPrice: 110, stockCount: 2, size: 'S' },
    { variantId: 'v-2', productId: 'p-1', sku: 'SKU-M', sellingPrice: 120, compareAtPrice: 150, stockCount: 3, size: 'M' },
  ];

  const csv = csvRows(toShopifyCSV([product], variants));
  assert('CSV first variant uses variant selling price', csv[1][7] === '80', csv[1][7]);
  assert('CSV first variant uses variant compare-at price', csv[1][8] === '110', csv[1][8]);
  assert('CSV second variant uses variant selling price', csv[2][7] === '120', csv[2][7]);
  assert('CSV second variant uses variant compare-at price', csv[2][8] === '150', csv[2][8]);

  const feed = toJSONFeed([product], variants);
  assert('JSON feed first variant uses variant selling price', feed[0].variants[0].price === 80, feed[0].variants[0].price);
  assert('JSON feed second variant uses variant compare-at price', feed[0].variants[1].compareAtPrice === 150, feed[0].variants[1].compareAtPrice);

  const ld = toJsonLD([product], variants);
  assert('JSON-LD first variant uses variant selling price', ld[0].offers.price === 80, ld[0].offers.price);
  assert('JSON-LD second variant uses variant selling price', ld[1].offers.price === 120, ld[1].offers.price);

  console.groupEnd();
}

function testProductPricingFallback() {
  console.group('2. Product Pricing Fallback');

  const product = {
    id: 'p-2',
    sku: 'TGJ-RNG-BRS-00002',
    name: 'Single Price Ring',
    status: 'READY_FOR_ECOMMERCE',
    sellingPrice: 99,
    compareAtPrice: 129,
    variantPricingEnabled: false,
  };
  const variants = [
    { variantId: 'v-3', productId: 'p-2', sku: 'SKU-L', sellingPrice: 79, compareAtPrice: 109, stockCount: 1 },
  ];

  const csv = csvRows(toShopifyCSV([product], variants));
  assert('CSV ignores variant price when toggle is off', csv[1][7] === '99', csv[1][7]);
  assert('CSV ignores variant compare-at when toggle is off', csv[1][8] === '129', csv[1][8]);

  const feed = toJSONFeed([product], variants);
  assert('JSON feed ignores variant price when toggle is off', feed[0].variants[0].price === 99, feed[0].variants[0].price);

  const ld = toJsonLD([product], variants);
  assert('JSON-LD ignores variant price when toggle is off', ld[0].offers.price === 99, ld[0].offers.price);

  console.groupEnd();
}

function run() {
  console.group('%cTuguPIM — Export Tests', 'font-weight:bold; font-size:14px');
  testVariantPricingExports();
  testProductPricingFallback();

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
