import webpush from "web-push";
import { serverFirebaseConfig } from "./firebaseConfig.js";
import type { SupportedDeskTimeframe } from "./types.js";

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

// In-memory subscription registry indexed by endpoint
const activeSubscriptions = new Map<string, StoredPushSubscription>();

// Deduplication cache: key -> timestamp sent
const deduplicationCache = new Map<string, number>();

export function getPublicVapidKey(): string {
  return DEFAULT_VAPID_PUBLIC_KEY;
}

export function registerSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId?: string;
  deviceLabel?: string;
}): { success: boolean; totalActive: number } {
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error("Invalid push subscription object: missing endpoint or keys");
  }

  activeSubscriptions.set(sub.endpoint, {
    ...sub,
    createdAt: Date.now(),
  });

  return {
    success: true,
    totalActive: activeSubscriptions.size,
  };
}

export function unregisterSubscription(endpoint: string): { success: boolean; totalActive: number } {
  activeSubscriptions.delete(endpoint);
  return {
    success: true,
    totalActive: activeSubscriptions.size,
  };
}

export function getSubscriptionsForUser(userId?: string): StoredPushSubscription[] {
  const all = Array.from(activeSubscriptions.values());
  if (!userId) return all;
  return all.filter((s) => !s.userId || s.userId === userId);
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

  const targets = getSubscriptionsForUser(targetUserId);
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
        activeSubscriptions.delete(sub.endpoint);
        removed++;
      }
    }
  });

  await Promise.allSettled(pushPromises);

  return { sent, failed, removed };
}

export { serverFirebaseConfig };
