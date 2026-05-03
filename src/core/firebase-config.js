/**
 * Firebase project configuration — fill in before enabling cloud mode.
 *
 * SETUP CHECKLIST (one-time):
 * 1. Go to https://console.firebase.google.com/ → Create a project
 * 2. Project Settings → Add Web App → copy the firebaseConfig object below
 * 3. Build → Firestore Database → Create database (start in test mode)
 * 4. Build → Authentication → Sign-in method → Enable "Email/Password"
 * 5. Build → Storage → Get started (for image uploads in Task 4)
 * 6. Set CLOUD_ENABLED = true and paste your credentials, then hard-refresh
 *
 * SECURITY NOTE: Before going to production, lock Firestore rules so each
 * user can only read/write documents matching their userId / role.
 */

export const CLOUD_ENABLED = false; // ← flip to true after filling credentials

export const FIREBASE_CONFIG = {
  apiKey:            'REPLACE_WITH_YOUR_API_KEY',
  authDomain:        'REPLACE_WITH_YOUR_AUTH_DOMAIN',
  projectId:         'REPLACE_WITH_YOUR_PROJECT_ID',
  storageBucket:     'REPLACE_WITH_YOUR_STORAGE_BUCKET',
  messagingSenderId: 'REPLACE_WITH_YOUR_MESSAGING_SENDER_ID',
  appId:             'REPLACE_WITH_YOUR_APP_ID',
};

// Firebase SDK version pinned here — update in one place if you need to upgrade.
export const FIREBASE_VERSION = '10.12.0';
