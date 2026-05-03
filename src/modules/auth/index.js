import DB from '../../core/db.js';
import { ROLE_PERMISSIONS, ACTIONS } from './permissions.js';
import { logViolation } from '../../core/logger.js';
import { getFirestoreDB, getAuthInstance, firebaseSignIn, firebaseSignOut } from '../../core/api.js';
import { doc, getDoc, onAuthStateChanged } from 'firebase/firestore';

// ─── Dynamic Overrides ────────────────────────────────────────────────────────
// Overrides are stored in Firestore: settings collection, document 'permissionOverrides'.

let _overrides = {
  transitions: {},
  actions:     {},
  fields:      {},
};

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
 * Load the current user and permission overrides from Firebase.
 */
export async function init() {
  return new Promise(async (resolve) => {
    const auth = getAuthInstance();
    
    // Listen for auth state changes to restore session
    onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const snap = await getDoc(doc(getFirestoreDB(), 'users', fbUser.uid));
          if (snap.exists() && snap.data().isActive) {
            const d = snap.data();
            _currentUser = {
              userId: fbUser.uid,
              email: fbUser.email,
              displayName: d.displayName || fbUser.email,
              role: d.role,
              isActive: d.isActive,
              lastLoginAt: Date.now(),
            };
          }
        } catch (err) {
          console.error('[Auth] Failed to restore session:', err);
        }
      }

      // Load permission overrides from Firestore
      try {
        const overridesSetting = await DB.get('settings', 'permissionOverrides');
        if (overridesSetting?.value) _overrides = overridesSetting.value;
      } catch (err) {
        console.error('[Auth] Failed to load overrides:', err);
      }
      
      resolve();
    });
  });
}

/**
 * Cloud-mode sign-in: authenticates with Firebase, then resolves the user's
 * role and display name from the Firestore users collection.
 */
export async function login(email, password) {
  const credential = await firebaseSignIn(email, password);
  const uid = credential.user.uid;

  const snap = await getDoc(doc(getFirestoreDB(), 'users', uid));
  if (!snap.exists()) throw new Error('User record not found. Contact your administrator.');

  const d = snap.data();
  if (!d.isActive) throw new Error('Your account has been deactivated.');
  if (!ROLE_PERMISSIONS[d.role]) throw new Error(`Unknown role: "${d.role}"`);

  _currentUser = {
    userId: uid,
    email: credential.user.email,
    displayName: d.displayName || credential.user.email,
    role: d.role,
    isActive: d.isActive,
    lastLoginAt: Date.now(),
  };
  return _currentUser;
}

/**
 * Sign out the current user from Firebase.
 */
export async function logout() {
  _currentUser = null;
  await firebaseSignOut();
}

/**
 * Returns the currently authenticated user object, or null if not set.
 */
export function getCurrentUser() {
  return _currentUser;
}

/**
 * Legacy method for stub users — now only used for session persistence if needed.
 */
export async function setCurrentUser(user) {
  _currentUser = user;
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
