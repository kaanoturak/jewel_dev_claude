import DB from '../../core/db.js';
import { ROLE_PERMISSIONS, ACTIONS } from './permissions.js';
import { logViolation } from '../../core/logger.js';

// ─── Dynamic Overrides ────────────────────────────────────────────────────────
// Overrides are stored in IndexedDB: settings store, key 'permissionOverrides'.
// Structure: { transitions: { 'ROLE:FROM:TO': boolean }, actions: { 'ROLE:ACTION': boolean }, fields: { 'ROLE:FIELD': boolean } }

let _overrides = {
  transitions: {},
  actions:     {},
  fields:      {},
};

async function _loadOverrides() {
  const setting = await DB.get('settings', 'permissionOverrides');
  if (setting && setting.value) {
    _overrides = setting.value;
  }
}

export async function setOverride(type, key, value) {
  _overrides[type][key] = value;
  await DB.put('settings', {
    settingId: 'permissionOverrides',
    value: _overrides,
    updatedAt: Date.now(),
  });
}

export function getOverrides() {
  return _overrides;
}

// ─── In-memory current user ───────────────────────────────────────────────────

let _currentUser = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the current user and permission overrides.
 * Call once at app startup before any permission checks.
 */
export async function init() {
  const [userSetting, overridesSetting] = await Promise.all([
    DB.get('settings', 'currentUser'),
    DB.get('settings', 'permissionOverrides'),
  ]);

  if (userSetting && userSetting.value) {
    _currentUser = userSetting.value;
  }
  if (overridesSetting && overridesSetting.value) {
    _overrides = overridesSetting.value;
  }
}

/**
 * Returns the currently authenticated user object, or null if not set.
 */
export function getCurrentUser() {
  return _currentUser;
}

/**
 * Set the active user and persist it to the settings store.
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
 * Return true if `role` may perform a generic `action`.
 * Pass { silent: true } for UI visibility checks to suppress audit log noise.
 */
export function canDo(role, action, { silent = false } = {}) {
  if (role === 'SUPER_ADMIN') return true;

  const base = ROLE_PERMISSIONS[role]?.actions.includes(action) ?? false;
  const overrideKey = `${role}:${action}`;
  const override = _overrides.actions[overrideKey];

  const allowed = override !== undefined ? override : base;

  if (!allowed && !silent) {
    logViolation(role, action, {}, _currentUser?.userId);
  }

  return allowed;
}

/**
 * Return true if `role` may directly write `fieldKey` on a product record.
 * Workflow-managed fields return false for all roles.
 * Pass { silent: true } for UI visibility checks to suppress audit log noise.
 */
export function canEdit(role, fieldKey, { silent = false } = {}) {
  if (role === 'SUPER_ADMIN') return true;

  const base = ROLE_PERMISSIONS[role]?.fields.includes(fieldKey) ?? false;
  const overrideKey = `${role}:${fieldKey}`;
  const override = _overrides.fields[overrideKey];

  const allowed = override !== undefined ? override : base;

  if (!allowed && !silent) {
    logViolation(role, `EDIT_FIELD:${fieldKey}`, {}, _currentUser?.userId);
  }

  return allowed;
}

/**
 * Return true if `role` may access `panelName`.
 */
export function canView(role, panelName) {
  if (role === 'SUPER_ADMIN') return true;
  const allowed = ROLE_PERMISSIONS[role]?.panels.includes(panelName) ?? false;
  return allowed;
}

/**
 * Return true if `role` may initiate a status transition.
 */
export function canTransition(role, fromStatus, toStatus) {
  if (role === 'SUPER_ADMIN') return true;

  const transitionKey = `${fromStatus}:${toStatus}`;
  let allowed = false;

  // Check static permissions
  const perms = ROLE_PERMISSIONS[role];
  if (perms) {
    if (perms.transitions.includes(transitionKey)) {
      allowed = true;
    } else if (perms.transitions.includes(`*:${toStatus}`)) {
      allowed = true;
    }
  }

  // Apply dynamic overrides
  const overrideKey = `${role}:${transitionKey}`;
  const override = _overrides.transitions[overrideKey];
  if (override !== undefined) {
    allowed = override;
  }

  if (!allowed) {
    logViolation(role, `TRANSITION:${transitionKey}`, { fromStatus, toStatus }, _currentUser?.userId);
  }

  return allowed;
}
