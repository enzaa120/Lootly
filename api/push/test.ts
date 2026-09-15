import dotenv from "dotenv";
import { sendPushNotification, getSubscriptionsForUser } from "../_lib/pushService.ts";

dotenv.config();

export const maxDuration = 15;

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

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: `Method '${req.method}' not allowed. Use POST to trigger test notification.`,
    });
  }

  try {
    const body = await extractRequestBody(req);
    const { targetUserId } = body || {};

    const subs = getSubscriptionsForUser(targetUserId);
    if (subs.length === 0) {
      return res.status(404).json({
        success: false,
        error:
          "Tidak ada perangkat yang terdaftar untuk push notifikasi pada akun ini. Silakan aktifkan push notifikasi terlebih dahulu.",
      });
    }

    const result = await sendPushNotification(
      {
        title: "Lootly — Uji Coba Push Notifikasi",
        body: "Push notifikasi latar belakang berhasil terhubung! Anda akan menerima alert saat setup XAU/USD valid terbentuk.",
        tag: `lootly-test-${Date.now()}`,
        data: { url: "/ai-desk", type: "TEST" },
      },
      targetUserId
    );

    return res.status(200).json({
      success: true,
      message: "Tes notifikasi berhasil dikirim.",
      sent: result.sent,
      failed: result.failed,
    });
  } catch (err: any) {
    console.error("[Push Test Handler] Error:", err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}
