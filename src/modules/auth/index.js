import DB from '../../core/db.js';
import { ROLE_PERMISSIONS, ACTIONS } from './permissions.js';
import { logViolation } from '../../core/logger.js';
import { CLOUD_ENABLED, FIREBASE_VERSION } from '../../core/firebase-config.js';

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
  if (CLOUD_ENABLED) {
    // Restore session from Firebase Auth + Firestore
    const { getFirebaseCurrentUser, getFirestoreDB } = await import('../../core/api.js');
    const fbUser = getFirebaseCurrentUser();
    if (fbUser) {
      const { doc, getDoc } = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`);
      const snap = await getDoc(doc(getFirestoreDB(), 'users', fbUser.uid));
      if (snap.exists() && snap.data().isActive) {
        const d = snap.data();
        _currentUser = {
          userId: fbUser.uid, email: fbUser.email,
          displayName: d.displayName || fbUser.email,
          role: d.role, isActive: d.isActive, lastLoginAt: Date.now(),
        };
      }
    }
    // Load permission overrides from Firestore (CloudDB is already active at this point)
    const overridesSetting = await DB.get('settings', 'permissionOverrides');
    if (overridesSetting?.value) _overrides = overridesSetting.value;
    return;
  }

  // Local mode: restore from IndexedDB
  const [userSetting, overridesSetting] = await Promise.all([
    DB.get('settings', 'currentUser'),
    DB.get('settings', 'permissionOverrides'),
  ]);
  if (userSetting?.value)      _currentUser = userSetting.value;
  if (overridesSetting?.value) _overrides   = overridesSetting.value;
}

/**
 * Cloud-mode sign-in: authenticates with Firebase, then resolves the user's
 * role and display name from the Firestore users collection.
 * Returns the _currentUser object on success; throws on failure.
 */
export async function login(email, password) {
  if (!CLOUD_ENABLED) throw new Error('login() requires CLOUD_ENABLED=true');
  const { firebaseSignIn, getFirestoreDB } = await import('../../core/api.js');
  const { doc, getDoc } = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`);

  const credential = await firebaseSignIn(email, password);
  const uid = credential.user.uid;

  const snap = await getDoc(doc(getFirestoreDB(), 'users', uid));
  if (!snap.exists()) throw new Error('User record not found. Contact your administrator.');

  const d = snap.data();
  if (!d.isActive) throw new Error('Your account has been deactivated.');
  if (!ROLE_PERMISSIONS[d.role]) throw new Error(`Unknown role: "${d.role}"`);

  _currentUser = {
    userId: uid, email: credential.user.email,
    displayName: d.displayName || credential.user.email,
    role: d.role, isActive: d.isActive, lastLoginAt: Date.now(),
  };
  return _currentUser;
}

/**
 * Sign out the current user (works for both cloud and local modes).
 */
export async function logout() {
  _currentUser = null;
  if (CLOUD_ENABLED) {
    const { firebaseSignOut } = await import('../../core/api.js');
    await firebaseSignOut();
  } else {
    await DB.put('settings', { settingId: 'currentUser', value: null, updatedAt: Date.now() });
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
