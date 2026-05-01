import DB from '../../core/db.js';

// ─── Field-level edit permissions (Section 4) ─────────────────────────────────
// Maps each role to the set of product fields it may write directly.
// Workflow-managed fields (status, rejectionReason, revisionNotes, reviewedBy/At,
// version, computed fields) are absent from all sets — they are only written
// by the workflow or engine modules, never via direct State.set() calls.

const MANUFACTURER_FIELDS = new Set([
  'name', 'category', 'material', 'collection',
  'seoTitle', 'seoDescription', 'marketingDescription', 'productDescription',
  'materials', 'careInstructions', 'searchTags',
  'images', 'primaryImageIndex', 'video',
  'costMaterial', 'costLabor', 'costPackaging',
]);

const ADMIN_FIELDS = new Set([
  'adminTaxPct', 'adminMarginPct', 'adminLogisticsCost',
  'adminMarketingCost', 'adminMiscCost',
]);

const SALES_FIELDS = new Set([
  'sellingPrice', 'compareAtPrice', 'activeCampaignId',
]);

// ─── Panel access permissions ─────────────────────────────────────────────────

const PANEL_ACCESS = {
  MANUFACTURER: new Set(['manufacturer']),
  ADMIN:        new Set(['admin']),
  SALES:        new Set(['sales']),
  SUPER_ADMIN:  new Set(['manufacturer', 'admin', 'sales', 'super-admin']),
};

// ─── Workflow transition permissions (Section 7) ──────────────────────────────
// Keys are 'FROM_STATUS:TO_STATUS'. Admin also gets a wildcard for ARCHIVED
// (any status → ARCHIVED) handled separately in canTransition.

const MANUFACTURER_TRANSITIONS = new Set([
  'DRAFT:PENDING_ADMIN',
  'REVISION_REQUESTED_BY_ADMIN:PENDING_ADMIN',
  'REVISION_REQUESTED_BY_SALES:PENDING_ADMIN',
]);

const ADMIN_TRANSITIONS = new Set([
  'PENDING_ADMIN:PENDING_SALES',
  'PENDING_ADMIN:REVISION_REQUESTED_BY_ADMIN',
  'PENDING_ADMIN:REJECTED',
  'REVISION_REQUESTED_BY_SALES:PENDING_SALES',
  // Admin can archive from any status — wildcard handled in canTransition
]);

const SALES_TRANSITIONS = new Set([
  'PENDING_SALES:READY_FOR_ECOMMERCE',
  'PENDING_SALES:REVISION_REQUESTED_BY_SALES',
  'PENDING_SALES:REJECTED',
]);

// ─── In-memory current user ───────────────────────────────────────────────────

let _currentUser = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the current user from the settings store.
 * Call once at app startup before any permission checks.
 */
export async function init() {
  const setting = await DB.get('settings', 'currentUser');
  if (setting && setting.value) {
    _currentUser = setting.value;
  }
}

/**
 * Returns the currently authenticated user object, or null if not set.
 * Synchronous — relies on init() having been called at startup.
 */
export function getCurrentUser() {
  return _currentUser;
}

/**
 * Set the active user and persist it to the settings store.
 * Used at login / role-switch.
 */
export async function setCurrentUser(user) {
  _currentUser = user;
  await DB.put('settings', {
    settingId: 'currentUser',
    value: user,
    updatedAt: Date.now(),
  });
}

/**
 * Return true if `role` may directly write `fieldKey` on a product record.
 * SUPER_ADMIN may write any field.
 * Workflow-managed fields (status, version, reviewedBy, etc.) return false
 * for all roles — they must go through workflow.transition().
 */
export function canEdit(role, fieldKey) {
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'MANUFACTURER') return MANUFACTURER_FIELDS.has(fieldKey);
  if (role === 'ADMIN')        return ADMIN_FIELDS.has(fieldKey);
  if (role === 'SALES')        return SALES_FIELDS.has(fieldKey);
  return false;
}

/**
 * Return true if `role` may access `panelName`.
 * Panel names: 'manufacturer' | 'admin' | 'sales' | 'super-admin'
 */
export function canView(role, panelName) {
  if (role === 'SUPER_ADMIN') return true;
  const allowed = PANEL_ACCESS[role];
  return allowed ? allowed.has(panelName) : false;
}

/**
 * Return true if `role` may initiate a status transition from `fromStatus`
 * to `toStatus`.
 *
 * SUPER_ADMIN has no restrictions.
 * ADMIN may archive a product from any status.
 * All other roles are checked against their explicit transition set.
 */
export function canTransition(role, fromStatus, toStatus) {
  if (role === 'SUPER_ADMIN') return true;

  if (role === 'ADMIN') {
    // Admin can archive from any status (Section 7: "Any → ARCHIVED | Admin or Super Admin")
    if (toStatus === 'ARCHIVED') return true;
    return ADMIN_TRANSITIONS.has(`${fromStatus}:${toStatus}`);
  }

  if (role === 'MANUFACTURER') {
    return MANUFACTURER_TRANSITIONS.has(`${fromStatus}:${toStatus}`);
  }

  if (role === 'SALES') {
    return SALES_TRANSITIONS.has(`${fromStatus}:${toStatus}`);
  }

  return false;
}
