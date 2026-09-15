import dotenv from "dotenv";
import { sendPushNotification } from "../_lib/pushService.js";

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
    console.error("[Push Send Alert Handler] Error:", err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}
