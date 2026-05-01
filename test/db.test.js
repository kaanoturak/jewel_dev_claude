/**
 * TuguPIM — SKU & DB smoke tests
 *
 * Run from the browser console (requires a local HTTP server):
 *   import('/test/db.test.js')
 *
 * Each check prints ✅ PASS or ❌ FAIL with a detail note.
 * The sequence counter in IndexedDB keeps incrementing across runs — that is
 * correct behaviour. The tests never check absolute sequence numbers, only
 * the relative increment between two consecutive calls.
 */

import {
  generateProductSKU,
  generateVariantSKU,
  parseSKU,
  CATEGORY_CODES,
  MATERIAL_CODES,
} from '../src/modules/product/sku.js';

// ─── Assertion helpers ────────────────────────────────────────────────────────

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

function assertThrows(label, fn) {
  try {
    fn();
    console.error(`  ❌ FAIL  ${label}  (expected a throw — none occurred)`);
    _failed++;
  } catch {
    console.log(`  ✅ PASS  ${label}`);
    _passed++;
  }
}

async function assertRejects(label, fn) {
  try {
    await fn();
    console.error(`  ❌ FAIL  ${label}  (expected a rejection — none occurred)`);
    _failed++;
  } catch {
    console.log(`  ✅ PASS  ${label}`);
    _passed++;
  }
}

// ─── Test suites ──────────────────────────────────────────────────────────────

async function testSkuFormat() {
  console.group('1. generateProductSKU — format & uniqueness');

  const sku1 = await generateProductSKU('Ring', 'Brass');
  const sku2 = await generateProductSKU('Ring', 'Brass');

  const PARENT_SKU_RE = /^[A-Z]+-[A-Z]+-[A-Z]+-\d{5}$/;

  assert('SKU1 matches pattern [PREFIX]-[CAT]-[MAT]-[NNNNN]', PARENT_SKU_RE.test(sku1), sku1);
  assert('SKU2 matches pattern [PREFIX]-[CAT]-[MAT]-[NNNNN]', PARENT_SKU_RE.test(sku2), sku2);
  assert('SKU1 !== SKU2 (sequences never repeat)',            sku1 !== sku2, `${sku1} vs ${sku2}`);

  const p1 = parseSKU(sku1);
  const p2 = parseSKU(sku2);

  assert('SKU1 prefix  = TGJ',  p1.prefix   === 'TGJ',   p1.prefix);
  assert('SKU1 category = RNG', p1.category  === 'RNG',   p1.category);
  assert('SKU1 material = BRS', p1.material  === 'BRS',   p1.material);
  assert(
    'SKU2 sequence = SKU1 sequence + 1 (atomic increment)',
    p2.sequence === p1.sequence + 1,
    `${p1.sequence} → ${p2.sequence}`,
  );

  console.groupEnd();
}

async function testAllCombinations() {
  console.group('2. generateProductSKU — all categories and materials');

  const cases = [
    ['Necklace', 'Gold',   'NCK', 'GLD'],
    ['Earring',  'Silver', 'ERR', 'SLV'],
    ['Bracelet', 'Mixed',  'BRC', 'MIX'],
    ['Brooch',   'Brass',  'BRS', 'BRS'],
    ['Other',    'Gold',   'OTH', 'GLD'],
  ];

  for (const [cat, mat, catCode, matCode] of cases) {
    const sku = await generateProductSKU(cat, mat);
    assert(
      `${cat}/${mat} → *-${catCode}-${matCode}-*`,
      sku.includes(`-${catCode}-${matCode}-`),
      sku,
    );
  }

  console.groupEnd();
}

async function testVariantSKU() {
  console.group('3. generateVariantSKU');

  const parent = await generateProductSKU('Ring', 'Brass');
  const VARIANT_RE = /^[A-Z]+-[A-Z]+-[A-Z]+-\d{5}-[A-Z0-9]+$/;

  const v1 = generateVariantSKU(parent, 'S925');
  assert('Variant starts with parent SKU',           v1.startsWith(parent),       v1);
  assert('Variant matches full pattern',             VARIANT_RE.test(v1),         v1);
  assert('Suffix S925 appended correctly',           v1.endsWith('-S925'),        v1);

  const v2 = generateVariantSKU(parent, 'cgd');
  assert('Lowercase suffix is uppercased to CGD',    v2.endsWith('-CGD'),         v2);

  const v3 = generateVariantSKU(parent, '  abc  ');
  assert('Whitespace-padded suffix is trimmed/uppercased', v3.endsWith('-ABC'),   v3);

  assertThrows(
    'Suffix longer than 6 chars throws',
    () => generateVariantSKU(parent, 'TOOLONG'),
  );
  assertThrows('Empty suffix throws',     () => generateVariantSKU(parent, ''));
  assertThrows('Missing parentSku throws', () => generateVariantSKU(null,   'S1'));

  console.groupEnd();
}

async function testParseSKU() {
  console.group('4. parseSKU');

  const sku    = await generateProductSKU('Necklace', 'Silver');
  const parsed = parseSKU(sku);

  assert('parseSKU returns an object for valid parent SKU', parsed !== null,             sku);
  assert('parsed.prefix is a non-empty string',             typeof parsed.prefix === 'string' && parsed.prefix.length > 0);
  assert('parsed.sequence is a positive integer',           Number.isInteger(parsed.sequence) && parsed.sequence > 0);

  assert('parseSKU returns null for non-string input',  parseSKU(42)           === null);
  assert('parseSKU returns null for random string',     parseSKU('not-a-sku')  === null);
  assert('parseSKU returns null for variant SKU (extra segment)',
    parseSKU(generateVariantSKU(sku, 'V1')) === null);

  console.groupEnd();
}

async function testErrorHandling() {
  console.group('5. Error handling — bad inputs');

  await assertRejects('Unknown category rejects', () => generateProductSKU('Pendant', 'Brass'));
  await assertRejects('Unknown material rejects', () => generateProductSKU('Ring',    'Platinum'));

  console.groupEnd();
}

function testEnumCompleteness() {
  console.group('6. Enum completeness (spec §5.1 + §9)');

  const requiredCategories = { Ring:'RNG', Necklace:'NCK', Earring:'ERR', Bracelet:'BRC', Brooch:'BRS', Other:'OTH' };
  const requiredMaterials  = { Brass:'BRS', Gold:'GLD', Silver:'SLV', Mixed:'MIX' };

  for (const [name, code] of Object.entries(requiredCategories)) {
    assert(`CATEGORY_CODES["${name}"] === "${code}"`, CATEGORY_CODES[name] === code, CATEGORY_CODES[name]);
  }
  for (const [name, code] of Object.entries(requiredMaterials)) {
    assert(`MATERIAL_CODES["${name}"] === "${code}"`, MATERIAL_CODES[name] === code, MATERIAL_CODES[name]);
  }

  assert('No extra category keys beyond spec',
    Object.keys(CATEGORY_CODES).length === Object.keys(requiredCategories).length);
  assert('No extra material keys beyond spec',
    Object.keys(MATERIAL_CODES).length === Object.keys(requiredMaterials).length);

  console.groupEnd();
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  _passed = 0;
  _failed = 0;

  console.group('%cTuguPIM — SKU & DB Tests', 'font-weight:bold; font-size:14px');

  await testSkuFormat();
  await testAllCombinations();
  await testVariantSKU();
  await testParseSKU();
  await testErrorHandling();
  testEnumCompleteness();

  const total = _passed + _failed;
  console.log('─'.repeat(44));
  if (_failed === 0) {
    console.log(`%c✅  All ${total} checks passed`, 'color:#22c55e; font-weight:bold');
  } else {
    console.log(
      `%c❌  ${_failed} of ${total} checks failed`,
      'color:#ef4444; font-weight:bold',
    );
  }
  console.groupEnd();

  return { passed: _passed, failed: _failed };
}

run().catch((err) => {
  console.error('Test runner crashed:', err);
});
