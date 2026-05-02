/**
 * TuguPIM — End-to-end workflow test
 *
 * Run from the browser console (requires a local HTTP server):
 *   import('/test/e2e.test.js')
 *
 * Tests the full product lifecycle:
 *   MANUFACTURER creates → submits → PENDING_ADMIN
 *   ADMIN sets costs → approves → PENDING_SALES
 *   SALES sets price → approves → READY_FOR_ECOMMERCE
 *   Audit log entries verified at each stage
 *
 * All test records use a unique run-ID prefix so multiple runs don't
 * collide in IndexedDB. Cleanup removes all test records at the end.
 */

import DB                              from '../src/core/db.js';
import * as Auth                       from '../src/modules/auth/index.js';
import { transition, ALLOWED_TRANSITIONS } from '../src/modules/workflow/index.js';
import { generateUUID }                from '../src/shared/utils/index.js';
import { generateProductSKU }          from '../src/modules/product/sku.js';
import { calculate, getEffectivePrice } from '../src/core/engine.js';
import { validate, MANUFACTURER_COST_SCHEMA } from '../src/core/validator.js';

// ─── Test users ───────────────────────────────────────────────────────────────

const SUPER_USER = {
  userId:      'e2e-super-001',
  email:       'super@e2e.test',
  displayName: 'E2E Super Admin',
  role:        'SUPER_ADMIN',
  isActive:    true,
  createdAt:   Date.now(),
};

const MFR_USER = {
  userId:      'e2e-mfr-001',
  email:       'mfr@e2e.test',
  displayName: 'E2E Manufacturer',
  role:        'MANUFACTURER',
  isActive:    true,
  createdAt:   Date.now(),
};

const ADMIN_USER = {
  userId:      'e2e-admin-001',
  email:       'admin@e2e.test',
  displayName: 'E2E Admin',
  role:        'ADMIN',
  isActive:    true,
  createdAt:   Date.now(),
};

const SALES_USER = {
  userId:      'e2e-sales-001',
  email:       'sales@e2e.test',
  displayName: 'E2E Sales',
  role:        'SALES',
  isActive:    true,
  createdAt:   Date.now(),
};

// ─── Assertion helpers ────────────────────────────────────────────────────────

let _passed = 0;
let _failed = 0;
const _testProductIds = new Set();

async function safeCleanup(productId) {
  if (!productId) return;
  try {
    // 1. Delete all variants for this product
    const variants = await DB.queryByIndex('variants', 'productId', productId);
    if (variants && variants.length > 0) {
      await Promise.all(variants.map(v => DB.delete('variants', v.variantId)));
    }
    // 2. Delete the product itself
    await DB.delete('products', productId);
    // 3. Delete any audit logs for this product to keep it clean
    const logs = await DB.queryByIndex('auditLog', 'productId', productId);
    if (logs && logs.length > 0) {
      await Promise.all(logs.map(l => DB.delete('auditLog', l.logId)));
    }
  } catch (err) {
    // Ignore cleanup errors
  }
}

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS  ${label}`);
    _passed++;
  } else {
    console.error(`  ❌ FAIL  ${label}${detail ? `  →  ${detail}` : ''}`);
    _failed++;
  }
}

async function assertRejects(label, fn) {
  try {
    await fn();
    console.error(`  ❌ FAIL  ${label}  (expected rejection — none occurred)`);
    _failed++;
  } catch {
    console.log(`  ✅ PASS  ${label}`);
    _passed++;
  }
}

// ─── Test data factory ────────────────────────────────────────────────────────

function makeProduct(id, sku) {
  return {
    id,
    sku,
    name:                 'E2E Test Gold Ring',
    category:             'Ring',
    material:             'Gold',
    collection:           'Test Collection',
    seoTitle:             'E2E Test Gold Ring — TuguJewelry',
    seoDescription:       'A handcrafted gold ring created for end-to-end workflow testing.',
    marketingDescription: 'This stunning gold ring showcases artisan craftsmanship. Perfect for any occasion, it makes a timeless statement piece that will be treasured for years.',
    productDescription:   'Handcrafted from 18-karat gold, this ring features a classic band design polished to a mirror finish. Each piece is individually inspected to ensure the highest quality standards. Available in multiple sizes. Weight approximately 4 grams. Comes with a velvet gift box and authenticity certificate.',
    images:               [{ id: 'e2e-img-1', altText: 'E2E test ring front view' }],
    primaryImageIndex:    0,
    costMaterial:         12.50,
    costLabor:            8.00,
    costPackaging:        2.50,
    status:               'DRAFT',
    version:              1,
    createdAt:            Date.now(),
    updatedAt:            Date.now(),
  };
}

// ─── Test suites ──────────────────────────────────────────────────────────────

async function testStep1_ManufacturerCreatesAndSubmits(productId, sku) {
  console.group('1. Manufacturer: create product and submit');

  // Ensure product doesn't exist from a previous interrupted run
  _testProductIds.add(productId);
  await safeCleanup(productId);

  // Act as manufacturer
  await Auth.setCurrentUser(MFR_USER);
  assert('getCurrentUser() returns MANUFACTURER',
    Auth.getCurrentUser()?.role === 'MANUFACTURER');

  // Create product with all required fields
  const product = makeProduct(productId, sku);
  await DB.add('products', product);

  const saved = await DB.get('products', productId);
  assert('Product saved with DRAFT status', saved?.status === 'DRAFT', saved?.status);
  assert('Product has all required fields',
    !!saved?.name && !!saved?.category && !!saved?.material &&
    !!saved?.seoTitle && !!saved?.seoDescription &&
    !!saved?.marketingDescription && !!saved?.productDescription &&
    Array.isArray(saved?.images) && saved.images.length > 0,
    'One or more required fields missing'
  );

  // Reject: wrong role should not be allowed
  await Auth.setCurrentUser(ADMIN_USER);
  await assertRejects(
    'ADMIN cannot submit DRAFT → PENDING_ADMIN',
    () => transition(productId, 'PENDING_ADMIN', ADMIN_USER.userId)
  );

  // Correct role transitions
  await Auth.setCurrentUser(MFR_USER);
  await transition(productId, 'PENDING_ADMIN', MFR_USER.userId);

  const submitted = await DB.get('products', productId);
  assert('Status is now PENDING_ADMIN after submit',
    submitted?.status === 'PENDING_ADMIN', submitted?.status);
  assert('Version incremented to 2', submitted?.version === 2, String(submitted?.version));
  assert('updatedBy set to manufacturer userId',
    submitted?.updatedBy === MFR_USER.userId, submitted?.updatedBy);

  // Cannot re-submit from PENDING_ADMIN
  await assertRejects(
    'Cannot transition PENDING_ADMIN → PENDING_ADMIN',
    () => transition(productId, 'PENDING_ADMIN', MFR_USER.userId)
  );

  console.groupEnd();
  return submitted;
}

async function testStep2_AdminCostsAndApprove(productId) {
  console.group('2. Admin: set cost layer and approve');

  await Auth.setCurrentUser(ADMIN_USER);
  assert('getCurrentUser() returns ADMIN', Auth.getCurrentUser()?.role === 'ADMIN');

  // Apply admin cost layer
  const adminCosts = {
    adminTaxPct:         10,
    adminMarginPct:      35,
    adminLogisticsCost:  3.00,
    adminMarketingCost:  1.50,
    adminMiscCost:       0.50,
    updatedBy:           ADMIN_USER.userId,
    updatedAt:           Date.now(),
  };

  // Calculate expected transfer price
  const product = await DB.get('products', productId);
  const { transferPrice } = calculate({ ...product, ...adminCosts });
  assert('calculate() returns a transferPrice > 0', transferPrice != null && transferPrice > 0,
    String(transferPrice));

  await DB.patch('products', productId, { ...adminCosts, transferPrice });

  const afterCosts = await DB.get('products', productId);
  assert('adminMarginPct saved to product',
    afterCosts?.adminMarginPct === 35, String(afterCosts?.adminMarginPct));
  assert('transferPrice saved to product',
    afterCosts?.transferPrice === transferPrice, String(afterCosts?.transferPrice));

  // Reject: SALES cannot approve from PENDING_ADMIN
  await Auth.setCurrentUser(SALES_USER);
  await assertRejects(
    'SALES cannot approve PENDING_ADMIN → PENDING_SALES',
    () => transition(productId, 'PENDING_SALES', SALES_USER.userId)
  );

  // Correct role: ADMIN approves
  await Auth.setCurrentUser(ADMIN_USER);
  await transition(productId, 'PENDING_SALES', ADMIN_USER.userId);

  const approved = await DB.get('products', productId);
  assert('Status is now PENDING_SALES after admin approve',
    approved?.status === 'PENDING_SALES', approved?.status);
  assert('adminReviewedBy set', approved?.adminReviewedBy === ADMIN_USER.userId,
    approved?.adminReviewedBy);
  assert('revisionNotes cleared after approval', approved?.revisionNotes === null,
    String(approved?.revisionNotes));

  console.groupEnd();
  return approved;
}

async function testStep3_SalesPriceAndApprove(productId) {
  console.group('3. Sales: set selling price and approve');

  await Auth.setCurrentUser(SALES_USER);
  assert('getCurrentUser() returns SALES', Auth.getCurrentUser()?.role === 'SALES');

  // Set selling price — required before READY_FOR_ECOMMERCE
  await DB.patch('products', productId, {
    sellingPrice:   99.00,
    compareAtPrice: 129.00,
    updatedBy:      SALES_USER.userId,
    updatedAt:      Date.now(),
  });

  const afterPrice = await DB.get('products', productId);
  assert('sellingPrice saved', afterPrice?.sellingPrice === 99.00, String(afterPrice?.sellingPrice));
  assert('compareAtPrice saved', afterPrice?.compareAtPrice === 129.00,
    String(afterPrice?.compareAtPrice));

  // Reject: missing selling price should block — test directly on a fake product
  // (we already set sellingPrice so we test the transition success path here)

  // Reject: MANUFACTURER cannot approve PENDING_SALES
  await Auth.setCurrentUser(MFR_USER);
  await assertRejects(
    'MANUFACTURER cannot approve PENDING_SALES → READY_FOR_ECOMMERCE',
    () => transition(productId, 'READY_FOR_ECOMMERCE', MFR_USER.userId)
  );

  // Correct role: SALES approves
  await Auth.setCurrentUser(SALES_USER);
  await transition(productId, 'READY_FOR_ECOMMERCE', SALES_USER.userId);

  const ready = await DB.get('products', productId);
  assert('Status is now READY_FOR_ECOMMERCE',
    ready?.status === 'READY_FOR_ECOMMERCE', ready?.status);
  assert('salesReviewedBy set', ready?.salesReviewedBy === SALES_USER.userId,
    ready?.salesReviewedBy);
  assert('version is 4 after 3 transitions', ready?.version === 4, String(ready?.version));

  console.groupEnd();
  return ready;
}

async function testStep4_AuditLog(productId) {
  console.group('4. Audit log: verify transition entries');

  const entries = await DB.queryByIndex('auditLog', 'productId', productId);
  assert('At least 3 audit log entries exist', (entries?.length ?? 0) >= 3,
    `found ${entries?.length ?? 0}`);

  const transitions = (entries || []).filter(e => e.action === 'STATUS_CHANGE');
  assert('At least 3 STATUS_CHANGE entries', transitions.length >= 3,
    `found ${transitions.length}`);

  const toAdmin   = transitions.find(e => e.toStatus === 'PENDING_ADMIN');
  const toSales   = transitions.find(e => e.toStatus === 'PENDING_SALES');
  const toReady   = transitions.find(e => e.toStatus === 'READY_FOR_ECOMMERCE');

  assert('Audit entry: DRAFT → PENDING_ADMIN exists',
    !!toAdmin && toAdmin.fromStatus === 'DRAFT',
    toAdmin ? `found: ${toAdmin.fromStatus} → ${toAdmin.toStatus}` : 'not found');
  assert('Audit entry: PENDING_ADMIN → PENDING_SALES exists',
    !!toSales && toSales.fromStatus === 'PENDING_ADMIN',
    toSales ? `found: ${toSales.fromStatus} → ${toSales.toStatus}` : 'not found');
  assert('Audit entry: PENDING_SALES → READY_FOR_ECOMMERCE exists',
    !!toReady && toReady.fromStatus === 'PENDING_SALES',
    toReady ? `found: ${toReady.fromStatus} → ${toReady.toStatus}` : 'not found');

  assert('Manufacturer userId on submit entry',
    toAdmin?.userId === MFR_USER.userId, toAdmin?.userId);
  assert('Admin userId on approve entry',
    toSales?.userId === ADMIN_USER.userId, toSales?.userId);
  assert('Sales userId on approve entry',
    toReady?.userId === SALES_USER.userId, toReady?.userId);

  console.groupEnd();
}

async function testStep5_RevisionFlow() {
  console.group('5. Admin revision request flow');

  const productId = generateUUID();
  _testProductIds.add(productId);
  await safeCleanup(productId);

  const sku = await generateProductSKU('Necklace', 'Silver');
  const product = makeProduct(productId, sku);

  // Create and submit as manufacturer
  await Auth.setCurrentUser(MFR_USER);
  await DB.add('products', product);
  await transition(productId, 'PENDING_ADMIN', MFR_USER.userId);

  // Admin requests revision — notes required
  await Auth.setCurrentUser(ADMIN_USER);
  await assertRejects(
    'REVISION_REQUESTED_BY_ADMIN requires notes',
    () => transition(productId, 'REVISION_REQUESTED_BY_ADMIN', ADMIN_USER.userId, '')
  );

  await transition(productId, 'REVISION_REQUESTED_BY_ADMIN', ADMIN_USER.userId,
    'Please add more detailed product description.');

  const revised = await DB.get('products', productId);
  assert('Status is REVISION_REQUESTED_BY_ADMIN',
    revised?.status === 'REVISION_REQUESTED_BY_ADMIN', revised?.status);
  assert('revisionNotes set',
    revised?.revisionNotes?.includes('Please add'), revised?.revisionNotes);

  // Manufacturer re-submits
  await Auth.setCurrentUser(MFR_USER);
  await transition(productId, 'PENDING_ADMIN', MFR_USER.userId);

  const resubmitted = await DB.get('products', productId);
  assert('Status back to PENDING_ADMIN after re-submit',
    resubmitted?.status === 'PENDING_ADMIN', resubmitted?.status);
  assert('revisionNotes cleared after re-submit',
    resubmitted?.revisionNotes === null, String(resubmitted?.revisionNotes));

  // Cleanup
  try { await DB.delete('products', productId); } catch {}

  console.groupEnd();
}

async function testStep6_SalesRevisionLoop() {
  console.group('6. Sales revision loop: PENDING_SALES → REVISION_REQUESTED_BY_SALES → PENDING_ADMIN → PENDING_SALES → READY_FOR_ECOMMERCE');

  const productId = generateUUID();
  _testProductIds.add(productId);
  await safeCleanup(productId);

  const sku       = await generateProductSKU('Earring', 'Silver');
  const product   = makeProduct(productId, sku);

  // Set up: manufacturer submits, admin sets costs and approves
  await Auth.setCurrentUser(MFR_USER);
  await DB.add('products', product);
  await transition(productId, 'PENDING_ADMIN', MFR_USER.userId);

  await Auth.setCurrentUser(ADMIN_USER);
  const costs = {
    adminTaxPct: 10, adminMarginPct: 35,
    adminLogisticsCost: 3.00, adminMarketingCost: 1.50, adminMiscCost: 0.50,
  };
  const { transferPrice } = calculate({ ...product, ...costs });
  await DB.patch('products', productId, {
    ...costs, transferPrice,
    sellingPrice: 99.00,
    updatedBy: ADMIN_USER.userId, updatedAt: Date.now(),
  });
  await transition(productId, 'PENDING_SALES', ADMIN_USER.userId);

  const atSales = await DB.get('products', productId);
  assert('Product reaches PENDING_SALES', atSales?.status === 'PENDING_SALES', atSales?.status);

  // 1. ALLOWED_TRANSITIONS: REVISION_REQUESTED_BY_SALES routes through PENDING_ADMIN (not directly back to PENDING_SALES)
  assert('ALLOWED_TRANSITIONS: REVISION_REQUESTED_BY_SALES → PENDING_ADMIN is legal',
    ALLOWED_TRANSITIONS['REVISION_REQUESTED_BY_SALES']?.includes('PENDING_ADMIN'));
  assert('ALLOWED_TRANSITIONS: REVISION_REQUESTED_BY_SALES → PENDING_SALES is NOT in map',
    !ALLOWED_TRANSITIONS['REVISION_REQUESTED_BY_SALES']?.includes('PENDING_SALES'));

  // 2. Sales requests revision — notes are required
  await Auth.setCurrentUser(SALES_USER);
  await assertRejects(
    'REVISION_REQUESTED_BY_SALES requires notes',
    () => transition(productId, 'REVISION_REQUESTED_BY_SALES', SALES_USER.userId, '')
  );

  await transition(productId, 'REVISION_REQUESTED_BY_SALES', SALES_USER.userId,
    'Please add lifestyle images and update the product description.');

  const salesRevised = await DB.get('products', productId);
  assert('Status is REVISION_REQUESTED_BY_SALES after Sales requests revision',
    salesRevised?.status === 'REVISION_REQUESTED_BY_SALES', salesRevised?.status);
  assert('revisionNotes contains Sales feedback',
    salesRevised?.revisionNotes?.includes('lifestyle images'), salesRevised?.revisionNotes);

  // 3. MANUFACTURER cannot send directly to PENDING_SALES (must go through PENDING_ADMIN)
  await Auth.setCurrentUser(MFR_USER);
  await assertRejects(
    'MANUFACTURER cannot transition REVISION_REQUESTED_BY_SALES → PENDING_SALES',
    () => transition(productId, 'PENDING_SALES', MFR_USER.userId)
  );

  // 4. Manufacturer resubmits to PENDING_ADMIN
  await transition(productId, 'PENDING_ADMIN', MFR_USER.userId);

  const resubmitted = await DB.get('products', productId);
  assert('Status is PENDING_ADMIN after manufacturer resubmits',
    resubmitted?.status === 'PENDING_ADMIN', resubmitted?.status);
  assert('revisionNotes cleared after manufacturer resubmit',
    resubmitted?.revisionNotes === null, String(resubmitted?.revisionNotes));

  // 5. Admin re-approves to PENDING_SALES
  await Auth.setCurrentUser(ADMIN_USER);
  await transition(productId, 'PENDING_SALES', ADMIN_USER.userId);

  const backAtSales = await DB.get('products', productId);
  assert('Status back to PENDING_SALES after admin re-approves',
    backAtSales?.status === 'PENDING_SALES', backAtSales?.status);

  // 6. Sales can now approve to READY_FOR_ECOMMERCE
  await Auth.setCurrentUser(SALES_USER);
  await transition(productId, 'READY_FOR_ECOMMERCE', SALES_USER.userId);

  const ready = await DB.get('products', productId);
  assert('Product reaches READY_FOR_ECOMMERCE after full Sales revision loop',
    ready?.status === 'READY_FOR_ECOMMERCE', ready?.status);

  // Cleanup
  try { await DB.delete('products', productId); } catch {}

  console.groupEnd();
}

async function testStep7_PermissionEnforcement(productId) {
  console.group('7. Permission Enforcement: verify role boundaries');

  // Act as SALES
  await Auth.setCurrentUser(SALES_USER);

  // 1. Sales cannot edit Manufacturer fields (e.g. costMaterial)
  const pBefore = await DB.get('products', productId);
  const originalCost = pBefore.costMaterial;
  
  const State = await import('../src/core/state.js');
  State.registerAuth(Auth);
  State.load(pBefore);
  
  State.set('costMaterial', 999.99, SALES_USER.userId);
  const pAfter = await DB.get('products', productId);
  assert('SALES cannot edit costMaterial (Manufacturer field)',
    pAfter.costMaterial === originalCost, `Value changed to ${pAfter.costMaterial}`);

  // 2. Sales cannot trigger ADMIN transitions (PENDING_ADMIN -> PENDING_SALES)
  const adminTestId = generateUUID();
  _testProductIds.add(adminTestId);
  await safeCleanup(adminTestId);
  // Generate a unique SKU for this test product
  const adminTestSku = await generateProductSKU(pBefore.category || 'Ring', pBefore.material || 'Gold');
  await DB.add('products', { 
    ...pBefore, 
    id: adminTestId, 
    sku: adminTestSku, 
    status: 'PENDING_ADMIN' 
  });
  
  await assertRejects(
    'SALES cannot trigger ADMIN transition (PENDING_ADMIN → PENDING_SALES)',
    () => transition(adminTestId, 'PENDING_SALES', SALES_USER.userId)
  );

  // 3. MANUFACTURER cannot skip ADMIN (DRAFT → PENDING_SALES)
  await Auth.setCurrentUser(MFR_USER);
  const mfrTestId = generateUUID();
  _testProductIds.add(mfrTestId);
  await safeCleanup(mfrTestId);
  const mfrTestSku = await generateProductSKU(pBefore.category || 'Ring', pBefore.material || 'Gold');
  await DB.add('products', { 
    ...pBefore, 
    id: mfrTestId, 
    sku: mfrTestSku, 
    status: 'DRAFT' 
  });

  await assertRejects(
    'MANUFACTURER cannot skip ADMIN (DRAFT → PENDING_SALES)',
    () => transition(mfrTestId, 'PENDING_SALES', MFR_USER.userId)
  );

  // 4. ADMIN must act as bridge (PENDING_ADMIN → READY_FOR_ECOMMERCE is illegal)
  await Auth.setCurrentUser(ADMIN_USER);
  await assertRejects(
    'ADMIN cannot skip SALES (PENDING_ADMIN → READY_FOR_ECOMMERCE)',
    () => transition(adminTestId, 'READY_FOR_ECOMMERCE', ADMIN_USER.userId)
  );

  // Cleanup
  await DB.delete('products', adminTestId);
  await DB.delete('products', mfrTestId);

  console.groupEnd();
}

async function testStep8_DynamicOverrides() {
  console.group('8. Dynamic Overrides: Super Admin authority');

  const productId = generateUUID();
  _testProductIds.add(productId);
  await safeCleanup(productId);

  const sku = await generateProductSKU('Ring', 'Gold');
  await DB.add('products', { ...makeProduct(productId, sku), status: 'PENDING_ADMIN' });

  // 1. Super Admin disables Admin approve transition
  await Auth.setCurrentUser(SUPER_USER);
  
  // Transition we will block: ADMIN:PENDING_ADMIN:PENDING_SALES
  await Auth.setOverride('transitions', 'ADMIN:PENDING_ADMIN:PENDING_SALES', false);

  // 2. Admin attempt to approve should now fail
  await Auth.setCurrentUser(ADMIN_USER);
  await assertRejects(
    'ADMIN approve fails after Super Admin dynamic override (disable)',
    () => transition(productId, 'PENDING_SALES', ADMIN_USER.userId)
  );

  // 3. Super Admin re-enables transition
  await Auth.setCurrentUser(SUPER_USER);
  await Auth.setOverride('transitions', 'ADMIN:PENDING_ADMIN:PENDING_SALES', true);

  // 4. Admin attempt to approve should now succeed
  await Auth.setCurrentUser(ADMIN_USER);
  await transition(productId, 'PENDING_SALES', ADMIN_USER.userId);
  const pAfter = await DB.get('products', productId);
  assert('ADMIN approve succeeds after Super Admin dynamic override (enable)',
    pAfter.status === 'PENDING_SALES');

  // 5. Super Admin can override ANY status (even terminal/illegal)
  await Auth.setCurrentUser(SUPER_USER);
  // PENDING_SALES -> DRAFT (Normally illegal in map)
  await transition(productId, 'DRAFT', SUPER_USER.userId);
  const pFinal = await DB.get('products', productId);
  assert('SUPER_ADMIN can bypass workflow map (PENDING_SALES → DRAFT)',
    pFinal.status === 'DRAFT');

  // Cleanup
  await DB.delete('products', productId);
  // Reset overrides for other tests
  await DB.delete('settings', 'permissionOverrides');

  console.groupEnd();
}

async function testStep9_ViolationLogging() {
  console.group('9. Violation Logging: verify blocked attempts are recorded');

  const productId = generateUUID();
  _testProductIds.add(productId);
  await safeCleanup(productId);

  const sku = await generateProductSKU('Earring', 'Gold');
  await DB.add('products', { ...makeProduct(productId, sku), status: 'PENDING_SALES' });

  // MANUFACTURER attempts to approve PENDING_SALES
  await Auth.setCurrentUser(MFR_USER);
  try { await transition(productId, 'READY_FOR_ECOMMERCE', MFR_USER.userId); } catch {}

  // Verify audit log
  await new Promise(r => setTimeout(r, 100));
  const logs = await DB.getAll('auditLog');
  const violation = logs.find(l => l.action === 'PERMISSION_VIOLATION' && l.userRole === 'MANUFACTURER');
  
  assert('Permission violation is logged in audit log', !!violation);
  assert('Violation notes contains transition info', violation?.notes?.includes('TRANSITION:PENDING_SALES:READY_FOR_ECOMMERCE'));

  await DB.delete('products', productId);
  console.groupEnd();
}

async function testStep_Rejection() {
  console.group('10. Rejection path: Admin rejects, MANUFACTURER cannot act, SUPER_ADMIN recovers');

  const productId = generateUUID();
  _testProductIds.add(productId);
  await safeCleanup(productId);

  const sku = await generateProductSKU('Bracelet', 'Silver');
  const product = makeProduct(productId, sku);

  // Create and submit as manufacturer
  await Auth.setCurrentUser(MFR_USER);
  await DB.add('products', product);
  await transition(productId, 'PENDING_ADMIN', MFR_USER.userId);

  // Admin rejects — notes required
  await Auth.setCurrentUser(ADMIN_USER);
  await assertRejects(
    'REJECTED requires rejection notes',
    () => transition(productId, 'REJECTED', ADMIN_USER.userId, '')
  );

  await transition(productId, 'REJECTED', ADMIN_USER.userId, 'Product specification is incomplete.');

  const rejected = await DB.get('products', productId);
  assert('Status is REJECTED', rejected?.status === 'REJECTED', rejected?.status);
  assert('rejectionReason set', rejected?.rejectionReason?.includes('incomplete'), rejected?.rejectionReason);

  // MANUFACTURER cannot transition from REJECTED
  await Auth.setCurrentUser(MFR_USER);
  await assertRejects(
    'MANUFACTURER cannot act on REJECTED product',
    () => transition(productId, 'PENDING_ADMIN', MFR_USER.userId)
  );

  // SUPER_ADMIN can force from REJECTED to DRAFT
  await Auth.setCurrentUser(SUPER_USER);
  await transition(productId, 'DRAFT', SUPER_USER.userId, 'Recovered by Super Admin for resubmission.');

  const recovered = await DB.get('products', productId);
  assert('SUPER_ADMIN forced REJECTED → DRAFT', recovered?.status === 'DRAFT', recovered?.status);

  // Cleanup
  try { await DB.delete('products', productId); } catch {}

  console.groupEnd();
}

async function testStep_NegativeCosts() {
  console.group('11. Negative cost validation: schema rejects negative inputs');

  // validate() should reject negative costMaterial
  const negativeCosts = { costMaterial: -10, costLabor: 5 };
  const { valid: v1, errors: e1 } = validate(MANUFACTURER_COST_SCHEMA, negativeCosts);
  assert('Negative costMaterial fails MANUFACTURER_COST_SCHEMA',
    !v1 && !!e1.costMaterial, JSON.stringify(e1));

  // validate() should reject negative costLabor
  const negativeLabor = { costMaterial: 10, costLabor: -5 };
  const { valid: v2, errors: e2 } = validate(MANUFACTURER_COST_SCHEMA, negativeLabor);
  assert('Negative costLabor fails MANUFACTURER_COST_SCHEMA',
    !v2 && !!e2.costLabor, JSON.stringify(e2));

  // validate() should allow 0 for material cost (free items)
  const zeroCost = { costMaterial: 0, costLabor: 0 };
  const { valid: v3 } = validate(MANUFACTURER_COST_SCHEMA, zeroCost);
  assert('Zero costMaterial passes MANUFACTURER_COST_SCHEMA (free items allowed)', v3);

  // validate() should reject negative costPackaging when present
  const negativePkg = { costMaterial: 5, costLabor: 2, costPackaging: -1 };
  const { valid: v4, errors: e4 } = validate(MANUFACTURER_COST_SCHEMA, negativePkg);
  assert('Negative costPackaging fails MANUFACTURER_COST_SCHEMA',
    !v4 && !!e4.costPackaging, JSON.stringify(e4));

  console.groupEnd();
}

async function testStep_CampaignDiscount() {
  console.group('12. Campaign discount edge cases: >100% floors at $0, no crash');

  const product = { sellingPrice: 50 };

  // Over 100% discount → effective price = 0
  const overCampaign = {
    id: 'e2e-camp-over',
    isActive: true,
    startsAt: Date.now() - 1000,
    endsAt: null,
    discountType: 'PERCENTAGE',
    discountValue: 150,
  };
  const eff1 = getEffectivePrice(product, overCampaign);
  assert('150% PERCENTAGE discount floors effective price to 0', eff1 === 0, String(eff1));

  // Exactly 100% discount → effective price = 0
  const exactCampaign = { ...overCampaign, discountValue: 100 };
  const eff2 = getEffectivePrice(product, exactCampaign);
  assert('100% PERCENTAGE discount produces $0 effective price', eff2 === 0, String(eff2));

  // FIXED discount larger than price → effective price = 0
  const fixedOver = { ...overCampaign, discountType: 'FIXED', discountValue: 999 };
  const eff3 = getEffectivePrice(product, fixedOver);
  assert('FIXED discount larger than price floors to $0', eff3 === 0, String(eff3));

  // No crash when sellingPrice is null
  const nullProduct = { sellingPrice: null };
  const eff4 = getEffectivePrice(nullProduct, overCampaign);
  assert('No crash when sellingPrice is null, effectivePrice is null', eff4 === null, String(eff4));

  console.groupEnd();
}

async function testStep_DoubleSubmit() {
  console.group('13. Double-save guard: DB rejects duplicate product IDs');

  const productId = generateUUID();
  _testProductIds.add(productId);
  await safeCleanup(productId);

  const sku = await generateProductSKU('Brooch', 'Brass');
  const product = makeProduct(productId, sku);

  // First add should succeed
  await DB.add('products', product);
  const saved = await DB.get('products', productId);
  assert('First DB.add succeeds', saved?.id === productId);

  // Second add with same ID must throw — ConstraintError is the expected behavior
  try {
    await DB.add('products', { ...product });
    assert('Second DB.add rejected duplicate', false, 'expected ConstraintError — none thrown');
  } catch (err) {
    assert('Second DB.add rejected duplicate (ConstraintError)',
      err.name === 'ConstraintError' || err.message?.toLowerCase().includes('uniqu'),
      err.message);
  }

  const count = (await DB.getAll('products')).filter(p => p.id === productId).length;
  assert('Only one product record exists after duplicate attempt', count === 1, String(count));

  console.groupEnd();

  // Return productId so the runner's finally block can clean up
  return productId;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  console.group('%c TuguPIM — E2E Workflow Test', 'font-weight:bold;font-size:14px');
  console.log('Tests run in the browser against live IndexedDB.\n');

  try {
    // Init auth module (loads persisted user from settings if any)
    await Auth.init();

    const productId = generateUUID();
    const sku       = await generateProductSKU('Ring', 'Gold');

    await testStep1_ManufacturerCreatesAndSubmits(productId, sku);
    await testStep2_AdminCostsAndApprove(productId);
    await testStep3_SalesPriceAndApprove(productId);
    // Give IndexedDB a tick to flush audit log writes (fire-and-forget)
    await new Promise(r => setTimeout(r, 100));
    await testStep4_AuditLog(productId);
    await testStep5_RevisionFlow();
    await testStep6_SalesRevisionLoop();
    await testStep7_PermissionEnforcement(productId);
    await testStep8_DynamicOverrides();
    await testStep9_ViolationLogging();
    await testStep_Rejection();
    await testStep_NegativeCosts();
    await testStep_CampaignDiscount();
    await testStep_DoubleSubmit();
  } catch (err) {
    console.error('[e2e] Test suite failed prematurely:', err);
    _failed++;
  } finally {
    console.log('Finalizing: Cleaning up test data...');
    const cleanupTasks = Array.from(_testProductIds).map(id => safeCleanup(id));
    await Promise.all(cleanupTasks);
    
    // Reset settings
    try { await DB.delete('settings', 'permissionOverrides'); } catch {}
    // Restore whatever user was active before the test
    await Auth.init();
  }

  const total = _passed + _failed;
  console.log('─'.repeat(52));
  if (_failed === 0) {
    console.log(`%c✅  All ${total} checks passed`, 'color:#22c55e;font-weight:bold');
  } else {
    console.log(
      `%c❌  ${_failed} of ${total} checks failed`,
      'color:#ef4444;font-weight:bold',
    );
  }
  console.groupEnd();

  return { passed: _passed, failed: _failed };
}

run().catch(err => {
  console.error('[e2e] Test runner crashed:', err);
});
