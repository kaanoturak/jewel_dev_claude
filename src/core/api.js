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
  collection, query, where, runTransaction 
} from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

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

// ─── CloudDB — mirrors the db.js public API exactly ──────────────────────────

const CloudDB = {

  async get(storeName, key) {
    const snap = await getDoc(doc(getDB(), storeName, String(key)));
    return snap.exists() ? snap.data() : undefined;
  },

  async getAll(storeName) {
    const snap = await getDocs(collection(getDB(), storeName));
    return snap.docs.map(d => d.data());
  },

  async put(storeName, record) {
    const key = record[KEY_PATHS[storeName]];
    if (key == null) throw new Error(`put: missing key field "${KEY_PATHS[storeName]}" in ${storeName}`);
    
    // Intercept mediaBlobs to upload file to Storage
    if (storeName === 'mediaBlobs' && record.blob) {
      record.blob = await _uploadMedia(key, record.blob);
    }

    await setDoc(doc(getDB(), storeName, String(key)), record);
    return key;
  },

  async add(storeName, record) {
    const keyPath = KEY_PATHS[storeName];
    const key     = record[keyPath];

    if (key != null) {
      // Intercept mediaBlobs to upload file to Storage
      if (storeName === 'mediaBlobs' && record.blob) {
        record.blob = await _uploadMedia(key, record.blob);
      }
      await setDoc(doc(getDB(), storeName, String(key)), record);
      return key;
    }
    
    // Auto-ID (mostly auditLog)
    const ref    = await addDoc(collection(getDB(), storeName), record);
    const stored = { ...record, [keyPath]: ref.id };
    await setDoc(ref, stored);
    return ref.id;
  },

  async delete(storeName, key) {
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
    const snap = await getDocs(
      query(collection(getDB(), storeName), where(indexName, '==', value))
    );
    return snap.docs.map(d => d.data());
  },

  query(storeName, filters = {}) {
    const keys = Object.keys(filters);
    if (keys.length === 0) return CloudDB.getAll(storeName);

    const [firstKey, ...rest] = keys;
    return CloudDB.queryByIndex(storeName, firstKey, filters[firstKey]).then(records => {
      if (rest.length === 0) return records;
      return records.filter(r => rest.every(k => r[k] === filters[k]));
    });
  },

  async atomicIncrement(settingId) {
    const ref = doc(getDB(), 'settings', settingId);
    return await runTransaction(getDB(), async (tx) => {
      const snap = await tx.get(ref);
      const next = snap.exists() ? (snap.data().value || 0) + 1 : 1;
      tx.set(ref, { settingId, value: next, updatedAt: Date.now() });
      return next;
    });
  },
};

export default CloudDB;
