export function getStorage() {
  return { kind: 'test-storage' };
}

export function ref(storage, path) {
  return { storage, path };
}

export async function uploadBytes() {
  return {};
}

export async function getDownloadURL(storageRef) {
  return `test://storage/${storageRef.path}`;
}

export async function deleteObject() {
  return undefined;
}
