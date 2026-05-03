/**
 * Cloud adapter layer — Firebase Firestore + Storage.
 *
 * This module is ONLY loaded when CLOUD_ENABLED = true (see firebase-config.js).
 * It exposes the same method signatures as db.js so callers need zero changes.
 *
 * Firebase SDK is loaded from the official CDN via dynamic ESM imports —
 * no Node.js, no build step, no package.json changes required.
 */

import { FIREBASE_CONFIG, initFirebase, getDB, getAuthInst, getStore } from './firebase-config.js';
import { 
  doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, 
  collection, query, where, runTransaction, writeBatch 
} from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { validate, PRODUCT_SCHEMA } from './validator.js';

// ─── Tenant Context ──────────────────────────────────────────────────────────

let _userGetter = () => null;

/**
 * Register a function to retrieve the current user's context (including vendorId).
 * Used to avoid circular dependencies between api.js and auth/index.js.
 */
export function registerUserGetter(fn) {
  _userGetter = fn;
}

function _getVendorContext() {
  const user = _userGetter();
  return {
    vendorId: user?.vendorId ?? null,
    isAdmin:  user?.role === 'SUPER_ADMIN' || (user && user.vendorId === null),
  };
}

/**
 * Primary key field per collection (mirrors IndexedDB keyPath definitions).
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

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { initFirebase };
export const getFirestoreDB      = getDB;
export const getAuthInstance     = getAuthInst;
export const getStorageInst      = getStore;

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Ensures a record has the correct vendorId before writing.
 */
function _injectVendor(record) {
  const { vendorId } = _getVendorContext();
  if (vendorId === null) return record; // Platform admins don't inject
  return { ...record, vendorId };
}

/**
 * Validates that the current user owns the record they are trying to access/modify.
 */
async function _validateOwnership(storeName, key) {
  const { vendorId, isAdmin } = _getVendorContext();
  if (isAdmin) return true;

  const snap = await getDoc(doc(getDB(), storeName, String(key)));
  if (!snap.exists()) return true; // Let the caller handle 404
  
  const data = snap.data();
  if (data.vendorId !== vendorId) {
    throw new Error(`Security Violation: Access denied to ${storeName}/${key}`);
  }
  return true;
}

/**
 * Uploads a file to Firebase Storage and returns its download URL.
 */
async function _uploadMedia(blobId, blob) {
  if (!(blob instanceof Blob) && !(blob instanceof File)) {
    return blob; // Already a URL or invalid
  }
  const storageRef = ref(getStore(), `media/${blobId}`);
  await uploadBytes(storageRef, blob);
  return await getDownloadURL(storageRef);
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function firebaseSignIn(email, password) {
  return signInWithEmailAndPassword(getAuthInst(), email, password);
}

export async function firebaseSignOut() {
  return signOut(getAuthInst());
}

/**
 * Safe Data Migration: Assigns 'LEGACY-VENDOR-001' to all existing records
 * that are missing a vendorId. Idempotent and resumable.
 */
export async function runSafeMigration() {
  const db = getDB();
  const migrationKey = 'migration_legacy_vendor_complete';
  const legacyVendorId = 'LEGACY-VENDOR-001';

  const statusSnap = await getDoc(doc(db, 'settings', migrationKey));
  if (statusSnap.exists() && statusSnap.data().value === true) {
    console.info('[Migration] Legacy vendor migration already completed.');
    return;
  }

  const collectionsToMigrate = [
    'products', 'variants', 'campaigns', 'mediaBlobs', 'auditLog', 'users'
  ];

  console.info('[Migration] Starting legacy vendor migration...');

  for (const collName of collectionsToMigrate) {
    const collRef = collection(db, collName);
    // Note: We can't use the scoped CloudDB.getAll because it filters by vendorId
    const snap = await getDocs(collRef);
    let batch = writeBatch(db);
    let count = 0;
    let totalUpdated = 0;

    for (const d of snap.docs) {
      const data = d.data();
      if (!data.vendorId) {
        batch.update(d.ref, { vendorId: legacyVendorId });
        count++;
        totalUpdated++;

        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
    }

    if (count > 0) {
      await batch.commit();
    }
    console.info(`[Migration] Updated ${totalUpdated} records in "${collName}"`);
  }

  await setDoc(doc(db, 'settings', migrationKey), {
    settingId: migrationKey,
    value: true,
    completedAt: Date.now()
  });

  console.info('[Migration] Legacy vendor migration complete.');
}

/**
 * Fetches dynamic attribute schema for a category from Firestore.
 * Falls back to static PRODUCT_SCHEMA if collection is empty or not found.
 */
async function _getDynamicSchema(category) {
  const db = getDB();
  const coll = collection(db, 'attributes');
  const q = query(coll, where('category', '==', category));
  const snap = await getDocs(q).catch(() => ({ empty: true })); // Safe fallback

  if (!snap || snap.empty) return PRODUCT_SCHEMA;

  // Transform attribute docs into a validator-compatible schema
  const schema = { ...PRODUCT_SCHEMA };
  snap.docs.forEach(d => {
    const attr = d.data();
    if (attr.field && attr.rules) {
      schema[attr.field] = attr.rules;
    }
  });
  return schema;
}

// ─── CloudDB — mirrors the db.js public API exactly ──────────────────────────

const CloudDB = {

  async get(storeName, key) {
    const snap = await getDoc(doc(getDB(), storeName, String(key)));
    if (!snap.exists()) return undefined;
    
    const data = snap.data();
    const { vendorId, isAdmin } = _getVendorContext();
    
    // Enforce read isolation
    if (!isAdmin && data.vendorId !== vendorId) {
      console.warn(`[Security] Blocked unauthorized read of ${storeName}/${key}`);
      return undefined;
    }
    
    return data;
  },

  async getAll(storeName) {
    const { vendorId, isAdmin } = _getVendorContext();
    const coll = collection(getDB(), storeName);
    
    // Enforce tenant filtering on reads
    const q = isAdmin 
      ? query(coll) 
      : query(coll, where('vendorId', '==', vendorId));
      
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },

  async put(storeName, record) {
    const key = record[KEY_PATHS[storeName]];
    if (key == null) throw new Error(`put: missing key field "${KEY_PATHS[storeName]}" in ${storeName}`);
    
    await _validateOwnership(storeName, key);
    const finalRecord = _injectVendor(record);

    // Dynamic Validation for Products
    if (storeName === 'products') {
      const schema = await _getDynamicSchema(finalRecord.category);
      const { valid, errors } = validate(schema, finalRecord);
      if (!valid) throw new Error(`Validation Failed: ${Object.values(errors).flat().join(', ')}`);
    }

    // Intercept mediaBlobs to upload file to Storage
    if (storeName === 'mediaBlobs' && finalRecord.blob) {
      finalRecord.blob = await _uploadMedia(key, finalRecord.blob);
    }

    await setDoc(doc(getDB(), storeName, String(key)), finalRecord);
    return key;
  },

  async add(storeName, record) {
    const keyPath = KEY_PATHS[storeName];
    const key     = record[keyPath];
    const finalRecord = _injectVendor(record);

    // Dynamic Validation for Products
    if (storeName === 'products') {
      const schema = await _getDynamicSchema(finalRecord.category);
      const { valid, errors } = validate(schema, finalRecord);
      if (!valid) throw new Error(`Validation Failed: ${Object.values(errors).flat().join(', ')}`);
    }

    if (key != null) {
      await _validateOwnership(storeName, key);
      // Intercept mediaBlobs to upload file to Storage
      if (storeName === 'mediaBlobs' && finalRecord.blob) {
        finalRecord.blob = await _uploadMedia(key, finalRecord.blob);
      }
      await setDoc(doc(getDB(), storeName, String(key)), finalRecord);
      return key;
    }
    
    // Auto-ID (mostly auditLog)
    const ref    = await addDoc(collection(getDB(), storeName), finalRecord);
    const stored = { ...finalRecord, [keyPath]: ref.id };
    await setDoc(ref, stored);
    return ref.id;
  },

  async delete(storeName, key) {
    await _validateOwnership(storeName, key);
    // If deleting from mediaBlobs, also delete from Storage
    if (storeName === 'mediaBlobs') {
      try {
        const storageRef = ref(getStore(), `media/${key}`);
        await deleteObject(storageRef);
      } catch (err) {
        console.warn(`[Storage] Failed to delete media/${key}:`, err.message);
      }
    }
    await deleteDoc(doc(getDB(), storeName, String(key)));
  },

  async patch(storeName, key, changes) {
    await _validateOwnership(storeName, key);
    const ref  = doc(getDB(), storeName, String(key));
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error(`patch: record "${key}" not found in "${storeName}"`);
    
    // Intercept mediaBlobs to upload file to Storage if blob changed
    if (storeName === 'mediaBlobs' && changes.blob) {
      changes.blob = await _uploadMedia(key, changes.blob);
    }

    await updateDoc(ref, changes);
  },

  async queryByIndex(storeName, indexName, value) {
    const { vendorId, isAdmin } = _getVendorContext();
    const coll = collection(getDB(), storeName);
    
    // Always include vendorId filter
    const q = isAdmin
      ? query(coll, where(indexName, '==', value))
      : query(coll, where(indexName, '==', value), where('vendorId', '==', vendorId));

    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },

  query(storeName, filters = {}) {
    const keys = Object.keys(filters);
    const { vendorId, isAdmin } = _getVendorContext();
    
    if (keys.length === 0) return CloudDB.getAll(storeName);

    // Start with vendor filter
    const coll = collection(getDB(), storeName);
    let q = isAdmin ? query(coll) : query(coll, where('vendorId', '==', vendorId));
    
    // Add all other filters
    for (const [k, v] of Object.entries(filters)) {
      q = query(q, where(k, '==', v));
    }

    return getDocs(q).then(snap => snap.docs.map(d => d.data()));
  },

  async atomicIncrement(settingId) {
    const { vendorId, isAdmin } = _getVendorContext();
    // For atomic increment, we scope settings to the vendor if not admin
    const actualId = isAdmin ? settingId : `${vendorId}_${settingId}`;
    
    const ref = doc(getDB(), 'settings', actualId);
    return await runTransaction(getDB(), async (tx) => {
      const snap = await tx.get(ref);
      const next = snap.exists() ? (snap.data().value || 0) + 1 : 1;
      tx.set(ref, { settingId, value: next, updatedAt: Date.now(), vendorId: vendorId });
      return next;
    });
  },
};

export default CloudDB;
