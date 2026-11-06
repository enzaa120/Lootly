import dotenv from "dotenv";
import {
  registerSubscription,
  unregisterSubscription,
  sendPushNotification,
  getSubscriptionsForUser,
} from "../_lib/pushService.js";

dotenv.config();

export const maxDuration = 30;

async function extractRequestBody(req: any): Promise<any> {
  try {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
      if (typeof req.body === "string") return JSON.parse(req.body);
      if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf-8"));
    }
    if (typeof req.on === "function" && !req.readableEnded) {
      return await new Promise((resolve) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: any) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on("end", () => {
          try {
            const raw = Buffer.concat(chunks).toString("utf-8");
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            resolve({});
          }
        });
        req.on("error", () => resolve({}));
      });
    }
    return req.body || {};
  } catch {
    return {};
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  // Determine action from Vercel dynamic param, query, or URL path
  let action = req.query?.action;
  if (!action && req.url) {
    const urlParts = req.url.split("?")[0].split("/");
    action = urlParts[urlParts.length - 1];
  }

  // 1. Action: public-key
  if (action === "public-key") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return res.status(405).json({
        ok: false,
        error: `Method '${req.method}' not allowed. Use GET to retrieve public key.`,
      });
    }
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return res.status(500).json({
        ok: false,
        code: "VAPID_PUBLIC_KEY_MISSING",
      });
    }
    return res.status(200).json({ ok: true, publicKey });
  }

  // 2. Action: subscribe
  if (action === "subscribe") {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: `Method '${req.method}' not allowed. Use POST to subscribe device.`,
      });
    }
    try {
      const body = await extractRequestBody(req);
      const { subscription, userId, deviceLabel } = body || {};
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ success: false, error: "PushSubscription endpoint required." });
      }
      const result = await registerSubscription({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userId,
        deviceLabel,
      });
      return res.status(200).json({
        success: true,
        uid: result.uid,
        subscriptionId: result.subscriptionId,
        stored: result.stored,
        totalActive: result.totalActive,
      });
    } catch (err: any) {
      console.error("[Push Subscribe] Error:", err);
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  }

  // 3. Action: unsubscribe
  if (action === "unsubscribe") {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: `Method '${req.method}' not allowed. Use POST to unsubscribe.`,
      });
    }
    try {
      const body = await extractRequestBody(req);
      const { endpoint, userId } = body || {};
      if (!endpoint) {
        return res.status(400).json({ success: false, error: "Subscription endpoint required." });
      }
      const result = await unregisterSubscription(endpoint, userId);
      return res.status(200).json({ success: true, totalActive: result.totalActive });
    } catch (err: any) {
      console.error("[Push Unsubscribe] Error:", err);
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  }

  // 4. Action: test
  if (action === "test") {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: `Method '${req.method}' not allowed. Use POST to trigger test notification.`,
      });
    }
    try {
      const body = await extractRequestBody(req);
      const { targetUserId } = body || {};
      const uid = targetUserId && targetUserId !== "guest_trader" ? targetUserId : "user_trader";
      const subs = await getSubscriptionsForUser(uid);
      console.log(`[Push] test uid=${uid} subscriptions=${subs.length}`);
      if (subs.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Tidak ada perangkat yang terdaftar untuk push notifikasi pada akun ini.",
        });
      }
      const result = await sendPushNotification(
        {
          title: "Lootly — Uji Coba Push Notifikasi",
          body: "Push notifikasi latar belakang berhasil terhubung!",
          tag: `lootly-test-${Date.now()}`,
          data: { url: "/journal", type: "TEST" },
        },
        uid
      );
      return res.status(200).json({
        success: true,
        message: "Tes notifikasi berhasil dikirim.",
        sent: result.sent,
        failed: result.failed,
      });
    } catch (err: any) {
      console.error("[Push Test] Error:", err);
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  }

  // 5. Action: send-alert
  if (action === "send-alert") {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: `Method '${req.method}' not allowed. Use POST to send alert.`,
      });
    }
    try {
      const body = await extractRequestBody(req);
      const { payload, targetUserId } = body || {};
      if (!payload || !payload.title || !payload.body) {
        return res.status(400).json({ success: false, error: "Payload with title and body is required." });
      }
      const result = await sendPushNotification(payload, targetUserId);
      return res.status(200).json({
        success: true,
        sent: result.sent,
        failed: result.failed,
        removed: result.removed,
        skippedDuplicate: result.skippedDuplicate || false,
      });
    } catch (err: any) {
      console.error("[Push Send Alert] Error:", err);
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  }

  return res.status(404).json({
    success: false,
    error: `Unknown push action: '${action}'. Valid actions: public-key, subscribe, unsubscribe, test, send-alert.`,
  });
}
