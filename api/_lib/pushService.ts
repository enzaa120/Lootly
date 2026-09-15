import webpush from "web-push";
import crypto from "crypto";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  collectionGroup,
  Firestore,
} from "firebase/firestore";
import { serverFirebaseConfig } from "./firebaseConfig.js";
import type { SupportedDeskTimeframe } from "./types.js";

// Named Firestore database ID: strictly connect to the configured named database
const FIRESTORE_DATABASE_ID =
  serverFirebaseConfig.firestoreDatabaseId ||
  "ai-studio-lootly-57005d49-edb2-43f4-9ea3-f71b1b106f8e";

// Lazy Firestore client for server / backend runtime
let backendDbInstance: Firestore | null = null;

export function getPushFirestore(): Firestore {
  if (!backendDbInstance) {
    const app =
      getApps().length === 0
        ? initializeApp({
            apiKey: serverFirebaseConfig.apiKey,
            authDomain: serverFirebaseConfig.authDomain,
            projectId: serverFirebaseConfig.projectId,
            storageBucket: serverFirebaseConfig.storageBucket,
            messagingSenderId: serverFirebaseConfig.messagingSenderId,
            appId: serverFirebaseConfig.appId,
          })
        : getApp();

    backendDbInstance = getFirestore(app, FIRESTORE_DATABASE_ID);
  }
  return backendDbInstance;
}

// Derive a safe, deterministic 32-character hex ID from the endpoint
export function getDeterministicSubscriptionId(endpoint: string): string {
  return crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 32);
}

// Default production-safe VAPID credentials (can be overridden via environment variables)
const DEFAULT_VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BFnLQ6hjUZ0PgTEkzx-chispYtvJ8sPLAjDfuBugOA0Q-h0JTFaCUuZv3Ra0uNiC-gAPLtyZcG36qybIZyAl7D0";

const DEFAULT_VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "tUeh-xFNbAl7uWgP_HyrFKkLwELV5Chwkr0mMz-s3IU";

const DEFAULT_VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:notifications@lootly.app";

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  try {
    webpush.setVapidDetails(
      DEFAULT_VAPID_SUBJECT,
      DEFAULT_VAPID_PUBLIC_KEY,
      DEFAULT_VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
  } catch (err) {
    console.error("[PushService] Failed to configure VAPID details:", err);
  }
}

export interface StoredPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId?: string;
  deviceLabel?: string;
  createdAt: number;
}

// Deduplication cache: key -> timestamp sent
const deduplicationCache = new Map<string, number>();

export function getPublicVapidKey(): string {
  return DEFAULT_VAPID_PUBLIC_KEY;
}

export interface RegisterSubscriptionParams {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId?: string;
  deviceLabel?: string;
}

export interface RegisterSubscriptionResult {
  success: boolean;
  uid: string;
  subscriptionId: string;
  stored: boolean;
  totalActive: number;
}

/**
 * Persist Web Push subscription into Firestore canonical path:
 * users/{uid}/pushSubscriptions/{subscriptionId}
 * Immediately performs a server-side read-back to verify persistence.
 */
export async function registerSubscription(
  sub: RegisterSubscriptionParams
): Promise<RegisterSubscriptionResult> {
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error("Invalid push subscription object: missing endpoint or keys");
  }

  const uid = sub.userId && sub.userId !== "guest_trader" ? sub.userId : "user_trader";
  const subscriptionId = getDeterministicSubscriptionId(sub.endpoint);
  const db = getPushFirestore();

  // Canonical collection path: users/{uid}/pushSubscriptions/{subscriptionId}
  const docRef = doc(db, "users", uid, "pushSubscriptions", subscriptionId);
  const now = new Date().toISOString();

  await setDoc(
    docRef,
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      deviceLabel: sub.deviceLabel || "Web Browser",
      enabled: true,
      userId: uid,
      updatedAt: now,
    },
    { merge: true }
  );

  // Requirement 6: Immediately read back from the SAME canonical path
  const readBackSnap = await getDoc(docRef);
  if (!readBackSnap.exists()) {
    throw new Error("PUSH_SUBSCRIPTION_PERSISTENCE_FAILED");
  }

  // Count active subscriptions for this user
  const activeSubs = await getSubscriptionsForUser(uid);
  const totalActive = activeSubs.length;

  // Requirement 10: safe production log
  console.log(`[Push] subscribe uid=${uid} stored=true totalActive=${totalActive}`);

  return {
    success: true,
    uid,
    subscriptionId,
    stored: true,
    totalActive,
  };
}

/**
 * Unsubscribe / disable a Web Push subscription in Firestore
 */
export async function unregisterSubscription(
  endpoint: string,
  userId?: string
): Promise<{ success: boolean; totalActive: number }> {
  const db = getPushFirestore();
  const subId = getDeterministicSubscriptionId(endpoint);
  const now = new Date().toISOString();

  if (userId && userId !== "guest_trader") {
    const docRef = doc(db, "users", userId, "pushSubscriptions", subId);
    await setDoc(docRef, { enabled: false, updatedAt: now }, { merge: true });
    const remaining = await getSubscriptionsForUser(userId);
    return { success: true, totalActive: remaining.length };
  }

  try {
    const q = query(collectionGroup(db, "pushSubscriptions"), where("endpoint", "==", endpoint));
    const snap = await getDocs(q);
    const updates = snap.docs.map((d) =>
      setDoc(d.ref, { enabled: false, updatedAt: now }, { merge: true })
    );
    await Promise.allSettled(updates);
  } catch (err) {
    console.warn("[Push] Error disabling subscription:", err);
  }

  return { success: true, totalActive: 0 };
}

/**
 * Retrieve enabled push subscriptions for a user from Firestore canonical path:
 * users/{uid}/pushSubscriptions
 */
export async function getSubscriptionsForUser(userId?: string): Promise<StoredPushSubscription[]> {
  const db = getPushFirestore();
  const subs: StoredPushSubscription[] = [];

  if (userId && userId !== "guest_trader") {
    const colRef = collection(db, "users", userId, "pushSubscriptions");
    const snap = await getDocs(colRef);

    snap.forEach((d) => {
      const data = d.data();
      if (data && data.enabled !== false && data.endpoint) {
        const p256dh = data.p256dh || data.keys?.p256dh || "";
        const authKey = data.auth || data.keys?.auth || "";
        if (p256dh && authKey) {
          subs.push({
            endpoint: data.endpoint,
            keys: {
              p256dh,
              auth: authKey,
            },
            userId,
            deviceLabel: data.deviceLabel || "Web Browser",
            createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
          });
        }
      }
    });
  } else {
    // If no specific userId, query enabled subscriptions across all users
    try {
      const q = query(collectionGroup(db, "pushSubscriptions"), where("enabled", "==", true));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        const data = d.data();
        if (data && data.endpoint) {
          const p256dh = data.p256dh || data.keys?.p256dh || "";
          const authKey = data.auth || data.keys?.auth || "";
          if (p256dh && authKey) {
            subs.push({
              endpoint: data.endpoint,
              keys: {
                p256dh,
                auth: authKey,
              },
              userId: data.userId,
              deviceLabel: data.deviceLabel || "Web Browser",
              createdAt: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
            });
          }
        }
      });
    } catch (err) {
      console.warn("[Push] Error fetching all subscriptions across users:", err);
    }
  }

  return subs;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    setupAnalysisId?: string;
    direction?: string;
    type?: "FORMING" | "VALID" | "TEST";
    timeframe?: SupportedDeskTimeframe;
  };
  vibrate?: number[];
}

export async function sendPushNotification(
  payload: PushNotificationPayload,
  targetUserId?: string
): Promise<{ sent: number; failed: number; removed: number; skippedDuplicate?: boolean }> {
  ensureVapidConfigured();

  // Deduplication check for automated trading alerts
  const dedupKey = payload.data?.setupAnalysisId && payload.data?.type
    ? `${payload.data.setupAnalysisId}_${payload.data.type}`
    : null;

  if (dedupKey) {
    const lastSent = deduplicationCache.get(dedupKey);
    const tenMinutes = 10 * 60 * 1000;
    if (lastSent && Date.now() - lastSent < tenMinutes) {
      return { sent: 0, failed: 0, removed: 0, skippedDuplicate: true };
    }
    deduplicationCache.set(dedupKey, Date.now());
  }

  const targets = await getSubscriptionsForUser(targetUserId);
  if (targets.length === 0) {
    return { sent: 0, failed: 0, removed: 0 };
  }

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon.svg",
    badge: payload.badge || "/favicon.svg",
    tag: payload.tag || "lootly-alert",
    data: payload.data || { url: "/ai-desk" },
    vibrate: payload.vibrate || [100, 50, 100],
  });

  let sent = 0;
  let failed = 0;
  let removed = 0;
  const db = getPushFirestore();

  const pushPromises = targets.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        payloadString,
        {
          TTL: 60 * 30, // 30 minutes TTL
          urgency: "high",
        }
      );
      sent++;
    } catch (err: any) {
      failed++;
      // Clean up invalid or expired subscriptions (404 Not Found, 410 Gone)
      if (err.statusCode === 404 || err.statusCode === 410) {
        removed++;
        if (sub.userId) {
          const subId = getDeterministicSubscriptionId(sub.endpoint);
          const docRef = doc(db, "users", sub.userId, "pushSubscriptions", subId);
          await setDoc(
            docRef,
            { enabled: false, updatedAt: new Date().toISOString() },
            { merge: true }
          ).catch(() => {});
        }
      }
    }
  });

  await Promise.allSettled(pushPromises);

  return { sent, failed, removed };
}

export { serverFirebaseConfig };

