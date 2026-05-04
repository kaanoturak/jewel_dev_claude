const auth = {
  currentUser: null,
  _listeners: new Set(),
};

export function getAuth() {
  return auth;
}

export async function signInWithEmailAndPassword(authInst, email, password) {
  const user = {
    uid: email,
    email,
    password,
  };
  authInst.currentUser = user;
  for (const listener of authInst._listeners) listener(user);
  return { user };
}

export async function signOut(authInst) {
  authInst.currentUser = null;
  for (const listener of authInst._listeners) listener(null);
}
