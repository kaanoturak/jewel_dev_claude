const stores = new Map();

function store(name) {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
}

function snapshot(id, data, ref = null) {
  return {
    id,
    ref,
    exists: () => data !== undefined,
    data: () => data,
  };
}

export function initializeFirestore() {
  return { kind: 'test-firestore' };
}

export function persistentLocalCache() {
  return {};
}

export function persistentMultipleTabManager() {
  return {};
}

export function doc(db, collectionName, id) {
  return { db, collectionName, id: String(id) };
}

export function collection(db, collectionName) {
  return { db, collectionName };
}

export function where(field, op, value) {
  return { field, op, value };
}

export function query(base, ...filters) {
  return {
    db: base.db,
    collectionName: base.collectionName,
    filters: [...(base.filters || []), ...filters],
  };
}

export async function getDoc(ref) {
  return snapshot(ref.id, store(ref.collectionName).get(ref.id), ref);
}

export async function getDocs(refOrQuery) {
  const filters = refOrQuery.filters || [];
  const docs = [];
  for (const [id, data] of store(refOrQuery.collectionName).entries()) {
    const matches = filters.every(filter => {
      if (filter.op !== '==') return true;
      return data?.[filter.field] === filter.value;
    });
    if (matches) docs.push(snapshot(id, data, doc(refOrQuery.db, refOrQuery.collectionName, id)));
  }
  return {
    empty: docs.length === 0,
    docs,
  };
}

export async function setDoc(ref, data) {
  store(ref.collectionName).set(ref.id, { ...data });
}

export async function addDoc(collRef, data) {
  const id = crypto.randomUUID();
  const ref = doc(collRef.db, collRef.collectionName, id);
  await setDoc(ref, data);
  return ref;
}

export async function updateDoc(ref, changes) {
  const current = store(ref.collectionName).get(ref.id) || {};
  store(ref.collectionName).set(ref.id, { ...current, ...changes });
}

export async function deleteDoc(ref) {
  store(ref.collectionName).delete(ref.id);
}

export function writeBatch(db) {
  const ops = [];
  return {
    update: (ref, changes) => ops.push(() => updateDoc(ref, changes)),
    set: (ref, data) => ops.push(() => setDoc(ref, data)),
    delete: ref => ops.push(() => deleteDoc(ref)),
    commit: async () => {
      for (const op of ops) await op();
    },
  };
}

export async function runTransaction(db, callback) {
  return callback({
    get: getDoc,
    set: setDoc,
    update: updateDoc,
    delete: deleteDoc,
  });
}

export function onAuthStateChanged(auth, callback) {
  auth._listeners.add(callback);
  queueMicrotask(() => callback(auth.currentUser));
  return () => auth._listeners.delete(callback);
}
