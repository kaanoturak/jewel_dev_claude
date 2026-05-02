const DB_NAME = 'tugu-pim';
const DB_VERSION = 1;

// Store definitions — each entry maps directly to Section 8 of the project spec.
// autoIncrement: true is only used for auditLog (integer PK, no client-side UUID needed).
const STORES = [
  {
    name: 'products',
    options: { keyPath: 'id' },
    indexes: [
      { name: 'sku',       keyPath: 'sku',       unique: true  },
      { name: 'status',    keyPath: 'status',    unique: false },
      { name: 'createdBy', keyPath: 'createdBy', unique: false },
    ],
  },
  {
    name: 'variants',
    options: { keyPath: 'variantId' },
    indexes: [
      { name: 'productId', keyPath: 'productId', unique: false },
      { name: 'sku',       keyPath: 'sku',       unique: true  },
    ],
  },
  {
    name: 'auditLog',
    options: { keyPath: 'logId', autoIncrement: true },
    indexes: [
      { name: 'productId', keyPath: 'productId', unique: false },
      { name: 'userId',    keyPath: 'userId',    unique: false },
      { name: 'timestamp', keyPath: 'timestamp', unique: false },
    ],
  },
  {
    name: 'productVersions',
    options: { keyPath: 'versionId' },
    indexes: [
      { name: 'productId', keyPath: 'productId', unique: false },
    ],
  },
  {
    name: 'campaigns',
    options: { keyPath: 'campaignId' },
    indexes: [
      { name: 'productId', keyPath: 'productId', unique: false },
    ],
  },
  {
    name: 'users',
    options: { keyPath: 'userId' },
    indexes: [
      { name: 'email', keyPath: 'email', unique: true },
    ],
  },
  {
    name: 'settings',
    options: { keyPath: 'settingId' },
    indexes: [],
  },
  {
    name: 'mediaBlobs',
    options: { keyPath: 'blobId' },
    indexes: [
      { name: 'productId', keyPath: 'productId', unique: false },
    ],
  },
];

// ─── Connection ──────────────────────────────────────────────────────────────

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      _applySchema(db);
    };

    req.onsuccess = (event) => {
      _db = event.target.result;

      // Surface any future version mismatch as an error rather than silent failure.
      _db.onversionchange = () => {
        _db.close();
        _db = null;
      };

      resolve(_db);
    };

    req.onerror = (event) => reject(event.target.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another open tab'));
  });
}

function _applySchema(db) {
  for (const store of STORES) {
    const objectStore = db.objectStoreNames.contains(store.name)
      ? db.transaction.objectStore(store.name)
      : db.createObjectStore(store.name, store.options);

    for (const idx of store.indexes) {
      if (!objectStore.indexNames.contains(idx.name)) {
        objectStore.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
      }
    }
  }
}

// ─── Transaction helper ───────────────────────────────────────────────────────

function _tx(storeName, mode, fn) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      tx.onerror = (e) => reject(e.target.error);
      tx.onabort = (e) => reject(e.target.error);

      fn(store, resolve, reject);
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

const DB = {
  /**
   * Fetch a single record by primary key.
   * Resolves to undefined if not found.
   */
  get(storeName, key) {
    return _tx(storeName, 'readonly', (store, resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * Fetch all records in a store. For large stores prefer queryByIndex.
   */
  getAll(storeName) {
    return _tx(storeName, 'readonly', (store, resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * Create or replace a record (upsert by primary key).
   * Returns the primary key of the written record.
   */
  put(storeName, record) {
    return _tx(storeName, 'readwrite', (store, resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * Insert a new record. Rejects if the primary key already exists.
   * Used for auditLog where autoIncrement assigns the key.
   */
  add(storeName, record) {
    return _tx(storeName, 'readwrite', (store, resolve, reject) => {
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * Delete a record by primary key.
   */
  delete(storeName, key) {
    return _tx(storeName, 'readwrite', (store, resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * Merge `changes` into an existing record in a single atomic transaction.
   * Rejects if the record does not exist.
   */
  patch(storeName, key, changes) {
    return _tx(storeName, 'readwrite', (store, resolve, reject) => {
      const getReq = store.get(key);

      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) {
          reject(new Error(`patch: record "${key}" not found in "${storeName}"`));
          return;
        }
        const putReq = store.put({ ...existing, ...changes });
        putReq.onsuccess = () => resolve(putReq.result);
        putReq.onerror = (e) => reject(e.target.error);
      };

      getReq.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * Retrieve all records matching a specific index value.
   * Example: DB.queryByIndex('variants', 'productId', 'uuid-123')
   */
  queryByIndex(storeName, indexName, value) {
    return _tx(storeName, 'readonly', (store, resolve, reject) => {
      const index = store.index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * Fetch all records then apply a plain-object filter.
   * Each key in `filters` must equal the corresponding field on the record.
   * Example: DB.query('products', { status: 'PENDING_ADMIN', createdBy: userId })
   *
   * Performance optimization: if any filter key matches a defined index for
   * the store, it uses queryByIndex first to narrow the result set.
   */
  query(storeName, filters = {}) {
    const keys = Object.keys(filters);
    if (keys.length === 0) return DB.getAll(storeName);

    // Find the first filter key that has a corresponding index.
    const storeDef = STORES.find((s) => s.name === storeName);
    const indexKey = keys.find((k) => storeDef?.indexes.some((idx) => idx.keyPath === k));

    const basePromise = indexKey
      ? DB.queryByIndex(storeName, indexKey, filters[indexKey])
      : DB.getAll(storeName);

    return basePromise.then((records) => {
      // Apply remaining filters (or all filters if no index was used) in memory.
      const remainingKeys = indexKey ? keys.filter((k) => k !== indexKey) : keys;
      if (remainingKeys.length === 0) return records;
      return records.filter((r) => remainingKeys.every((k) => r[k] === filters[k]));
    });
  },

  /**
   * Read-increment-write on a settings record's `value` field in one transaction.
   * Creates the record with value=1 if it does not exist yet.
   * Returns the new (post-increment) integer value.
   *
   * Used exclusively by the SKU generator so sequences are never duplicated,
   * even if two products are created in rapid succession.
   */
  atomicIncrement(settingId) {
    return openDB().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');

        tx.onerror = (e) => reject(e.target.error);
        tx.onabort = (e) => reject(e.target.error);

        const getReq = store.get(settingId);

        getReq.onsuccess = () => {
          const existing = getReq.result;
          const newValue = existing ? existing.value + 1 : 1;
          const putReq = store.put({
            settingId,
            value: newValue,
            updatedAt: Date.now(),
          });
          putReq.onsuccess = () => resolve(newValue);
          putReq.onerror = (e) => reject(e.target.error);
        };

        getReq.onerror = (e) => reject(e.target.error);
      });
    });
  },
};

export default DB;
