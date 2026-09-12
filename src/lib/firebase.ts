import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInAnonymously, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  User 
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  getDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy,
  Firestore
} from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL } from "firebase/storage";
import firebaseConfig from "../../firebase-applet-config.json";

// Firestore Database ID: prioritize VITE_FIREBASE_FIRESTORE_DATABASE_ID (rejecting "(default)"), then firebase-applet-config, fallback to named DB
const envDatabaseId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
const configDatabaseId = (firebaseConfig as any)?.firestoreDatabaseId;

export const FIRESTORE_DATABASE_ID: string =
  (envDatabaseId && envDatabaseId !== "(default)")
    ? envDatabaseId
    : (configDatabaseId && configDatabaseId !== "(default)")
      ? configDatabaseId
      : "ai-studio-lootly-57005d49-edb2-43f4-9ea3-f71b1b106f8e";

// Resolve Firebase configuration (supports optional Vercel VITE_FIREBASE_* environment variables)
const resolvedConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  firestoreDatabaseId: FIRESTORE_DATABASE_ID,
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(resolvedConfig) : getApp();

// Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// Firestore Database (strictly connect to named database, avoiding "(default)")
export const db: Firestore = getFirestore(app, FIRESTORE_DATABASE_ID);

// Storage
export const storage = getStorage(app);

// Helper Auth Functions
export async function signInWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: "select_account"
    });
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error: any) {
    console.error("Google sign in failed:", error);
    // If popup is blocked in iframe, allow anonymous guest fallback
    if (error?.code === "auth/popup-blocked" || error?.code === "auth/cancelled-popup-request") {
      const anonResult = await signInAnonymously(auth);
      return anonResult.user;
    }
    throw error;
  }
}

export async function signInAsGuest() {
  const result = await signInAnonymously(auth);
  return result.user;
}

export async function signOutUser() {
  await firebaseSignOut(auth);
}

// Upload screenshot helper with non-blocking timeout and fallback
export async function uploadScreenshotImage(userId: string, imageBase64: string): Promise<string> {
  // If base64 is already an HTTP URL or empty, return as is
  if (!imageBase64 || imageBase64.startsWith("http")) return imageBase64;
  if (!userId) return "";

  const uploadTask = async (): Promise<string> => {
    const filename = `users/${userId}/screenshots/${Date.now()}.png`;
    const storageRef = ref(storage, filename);
    await uploadString(storageRef, imageBase64, "data_url");
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  };

  const timeoutTask = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error("Storage upload timed out")), 5000)
  );

  try {
    return await Promise.race([uploadTask(), timeoutTask]);
  } catch (err) {
    console.warn("Firebase storage upload skipped/failed:", err);
    // Return empty string on failure so oversized base64 strings are never stored in Firestore
    return "";
  }
}
