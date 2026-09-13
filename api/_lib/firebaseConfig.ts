/**
 * Server-safe Firebase configuration for Vercel Serverless Functions.
 * Self-contained without requiring filesystem access to root JSON files at runtime.
 */
export const serverFirebaseConfig = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0984964714",
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "1:413328545061:web:4fd08181fc00cca2dbb6cc",
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "AIzaSyB68C726uBFiL5O8IAkzFN5YPidbUw_ZWo",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0984964714.firebaseapp.com",
  firestoreDatabaseId: process.env.VITE_FIRESTORE_DATABASE_ID || "ai-studio-lootly-57005d49-edb2-43f4-9ea3-f71b1b106f8e",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0984964714.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "413328545061",
};

export default serverFirebaseConfig;
