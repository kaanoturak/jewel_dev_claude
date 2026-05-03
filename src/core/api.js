/**
 * Cloud adapter layer — Firebase Firestore + Storage.
 *
 * This module is ONLY loaded when CLOUD_ENABLED = true (see firebase-config.js).
 * It exposes the same method signatures as db.js so callers need zero changes.
 *
 * Firebase SDK is loaded from the official CDN via dynamic ESM imports —
 * no Node.js, no build step, no package.json changes required.
 */

import { FIREBASE_CONFIG, FIREBASE_VERSION } from './firebase-config.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

// ─── Internal SDK handles ──────────────────────────────────────────────────────

let _app       = null;
let _db        = null; // Firestore instance
let _auth      = null; // Firebase Auth instance
let _storage   = null; // Firebase Storage instance
let _initPromise = null;

/**
 * Primary key field per collection (mirrors IndexedDB keyPath definitions).
 * Firestore document IDs will be set to the value of this field on each record.
 */
export const KEY_PATHS = {
  products:        'id',
  variants:        'variantId',
  auditLog:        'logId',
  productVersions: 'versionId',
  campaigns:       'campaignId',
  users:           'userId',
  settings:        'settingId',
  mediaBlobs:      'blobId',
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────

export async function initFirebase() {
  if (_app) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const [{ initializeApp }, { getFirestore }, { getAuth }, { getStorage }] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-firestore.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-storage.js`),
    ]);

    _app     = initializeApp(FIREBASE_CONFIG);
    _db      = getFirestore(_app);
    _auth    = getAuth(_app);
    _storage = getStorage(_app);

    console.info('[TuguPIM] Firebase connected (Firestore + Auth + Storage)');
  })();

  return _initPromise;
}

export const getFirestoreDB      = () => _db;
export const getAuthInstance     = () => _auth;
export const getStorageInst      = () => _storage;
export const getFirebaseApp      = () => _app;
export const getFirebaseCurrentUser = () => _auth?.currentUser ?? null;

// ─── Auth helpers (used by src/modules/auth/index.js) ─────────────────────────

export async function firebaseSignIn(email, password) {
  const { signInWithEmailAndPassword } = await import(`${CDN}/firebase-auth.js`);
  return signInWithEmailAndPassword(_auth, email, password);
}

export async function firebaseSignOut() {
  const { signOut } = await import(`${CDN}/firebase-auth.js`);
  return signOut(_auth);
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

async function _fs() {
  return (await import(`${CDN}/firebase-firestore.js`));
}

// ─── CloudDB — mirrors the db.js public API exactly ──────────────────────────

const CloudDB = {

  async get(storeName, key) {
    const { doc, getDoc } = await _fs();
    const snap = await getDoc(doc(_db, storeName, String(key)));
    return snap.exists() ? snap.data() : undefined;
  },

  async getAll(storeName) {
    const { collection, getDocs } = await _fs();
    const snap = await getDocs(collection(_db, storeName));
    return snap.docs.map(d => d.data());
  },

  async put(storeName, record) {
    const { doc, setDoc } = await _fs();
    const key = record[KEY_PATHS[storeName]];
    if (key == null) throw new Error(`put: missing key field "${KEY_PATHS[storeName]}" in ${storeName}`);
    await setDoc(doc(_db, storeName, String(key)), record);
    return key;
  },

  async add(storeName, record) {
    const { doc, setDoc, collection, addDoc } = await _fs();
    const keyPath = KEY_PATHS[storeName];
    const key     = record[keyPath];

    if (key != null) {
      // Has explicit key (all stores except auditLog with autoIncrement)
      await setDoc(doc(_db, storeName, String(key)), record);
      return key;
    }
    // autoIncrement equivalent: let Firestore generate the ID, store it back
    const ref    = await addDoc(collection(_db, storeName), record);
    const stored = { ...record, [keyPath]: ref.id };
    await setDoc(ref, stored);
    return ref.id;
  },

  async delete(storeName, key) {
    const { doc, deleteDoc } = await _fs();
    await deleteDoc(doc(_db, storeName, String(key)));
  },

  async patch(storeName, key, changes) {
    const { doc, updateDoc, getDoc } = await _fs();
    const ref  = doc(_db, storeName, String(key));
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error(`patch: record "${key}" not found in "${storeName}"`);
    await updateDoc(ref, changes);
  },

  async queryByIndex(storeName, indexName, value) {
    const { collection, query, where, getDocs } = await _fs();
    const snap = await getDocs(
      query(collection(_db, storeName), where(indexName, '==', value))
    );
    return snap.docs.map(d => d.data());
  },

  query(storeName, filters = {}) {
    const keys = Object.keys(filters);
    if (keys.length === 0) return CloudDB.getAll(storeName);

    // Use first filter as Firestore where() clause; filter the rest in memory
    const [firstKey, ...rest] = keys;
    return CloudDB.queryByIndex(storeName, firstKey, filters[firstKey]).then(records => {
      if (rest.length === 0) return records;
      return records.filter(r => rest.every(k => r[k] === filters[k]));
    });
  },

  async atomicIncrement(settingId) {
    const { doc, runTransaction } = await _fs();
    const ref = doc(_db, 'settings', settingId);
    const newValue = await runTransaction(_db, async (tx) => {
      const snap = await tx.get(ref);
      const next = snap.exists() ? (snap.data().value || 0) + 1 : 1;
      tx.set(ref, { settingId, value: next, updatedAt: Date.now() });
      return next;
    });
    return newValue;
  },
};

export default CloudDB;
