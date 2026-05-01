import { calculate } from './engine.js';
import { logAction  } from './logger.js';

// ─── COST_FIELDS (Section 15) ─────────────────────────────────────────────────
// Only changes to these fields trigger Engine.calculate(). All other field
// writes are stored and notified without triggering recalculation.

const COST_FIELDS = new Set([
  'costMaterial', 'costLabor', 'costPackaging',
  'adminTaxPct', 'adminMarginPct', 'adminLogisticsCost',
  'adminMarketingCost', 'adminMiscCost',
  'sellingPrice', 'compareAtPrice',
]);

// ─── Auth adapter ─────────────────────────────────────────────────────────────
// Defaults to permissive no-op until the auth module calls State.registerAuth().
// This avoids a circular dependency: state ← auth ← state.

let _auth = {
  getCurrentUser: () => null,
  canEdit:        () => true,
};

// ─── Internal state ───────────────────────────────────────────────────────────

let _product   = null;   // product record currently loaded for editing/viewing
let _campaign  = null;   // active campaign for the current product (for effectivePrice)
let _sessionId = null;   // stable ID for grouping all edits within one load() call
let _subscribers = [];   // change listeners: fn(key, newValue, snapshot)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _generateSessionId() {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function _runRecalculation() {
  const computed = calculate(_product, _campaign);
  _product.costBase      = computed.costBase;
  _product.transferPrice = computed.transferPrice;
  // effectivePrice is not stored on the product — it is derived at render time.
  // We surface it here only so subscribers can read it without a second call.
  _product._effectivePrice = computed.effectivePrice;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load a product (and its active campaign) into the state store.
 * Triggers an initial calculation and notifies all subscribers with key='*'.
 */
export function load(product, campaign = null) {
  _product   = { ...product };
  _campaign  = campaign ? { ...campaign } : null;
  _sessionId = _generateSessionId();

  _runRecalculation();
  _notify('*');
}

/**
 * Read a single field from the currently loaded product.
 * Returns undefined if no product is loaded or the field does not exist.
 */
export function get(key) {
  return _product ? _product[key] : undefined;
}

/**
 * Return a shallow copy of the full product state.
 * Used by workflow module for version snapshots and by DB saves.
 * The _effectivePrice sentinel field is stripped — it is not a stored field.
 */
export function getSnapshot() {
  if (!_product) return null;
  const { _effectivePrice, ...stored } = _product;
  return structuredClone(stored);
}

/**
 * Update a product field.
 *
 * Checks auth before writing. Silently returns (with a console.warn) if the
 * current user's role does not have edit permission for this field.
 *
 * COST_FIELDS trigger Engine.calculate() after the write. All writes trigger
 * notify() so subscribers can update the UI.
 *
 * @param {string} key    - Product field name
 * @param {*}      value  - New value
 * @param {string} userId - ID of the user performing the edit (for audit log)
 */
export function set(key, value, userId) {
  if (!_product) {
    console.warn('[State] set() called before load() — ignored');
    return;
  }

  const user = _auth.getCurrentUser();
  if (!_auth.canEdit(user?.role ?? null, key)) {
    console.warn(`[State] ${user?.role ?? 'UNKNOWN'} attempted to set "${key}" — denied`);
    return;
  }

  const oldValue = _product[key];
  if (oldValue === value) return; // nothing changed — skip notify and log

  _product[key] = value;

  if (COST_FIELDS.has(key)) {
    _runRecalculation();
  }

  // Fire-and-forget audit log — never blocks the UI update.
  logAction({
    productId:     _product.id,
    userId:        userId ?? user?.userId ?? null,
    userRole:      user?.role ?? null,
    action:        'FIELD_UPDATE',
    changedFields: [{ field: key, oldValue, newValue: value }],
    sessionId:     _sessionId,
  });

  _notify(key);
}

/**
 * Register a change listener.
 * fn is called as fn(key, newValue, snapshot) after every set().
 * key === '*' means the whole product was replaced (after load()).
 *
 * Returns an unsubscribe function.
 */
export function subscribe(fn) {
  _subscribers.push(fn);
  return () => unsubscribe(fn);
}

/**
 * Remove a previously registered listener.
 */
export function unsubscribe(fn) {
  _subscribers = _subscribers.filter((s) => s !== fn);
}

/**
 * Register the auth adapter.
 * Called once during app initialisation after the auth module is ready.
 *
 * The adapter must expose:
 *   getCurrentUser() → { userId, role } | null
 *   canEdit(role, fieldKey) → boolean
 */
export function registerAuth(authModule) {
  _auth = authModule;
}

// ─── Internal notify ─────────────────────────────────────────────────────────

function _notify(key) {
  const snapshot = getSnapshot();
  const value    = key === '*' ? snapshot : _product[key];
  for (const fn of _subscribers) {
    try {
      fn(key, value, snapshot);
    } catch (err) {
      console.warn('[State] Subscriber threw during notify:', err);
    }
  }
}
