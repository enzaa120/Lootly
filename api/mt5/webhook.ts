import type { IncomingMessage, ServerResponse } from "http";
import {
  verifyConnectorToken,
  processMT5Webhook,
} from "../_lib/mt5Service.js";
import type { MT5WebhookPayload } from "../_lib/types.js";

export default async function handler(
  req: IncomingMessage & {
    body?: any;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
  },
  res: ServerResponse & {
    status: (code: number) => any;
    json: (body: any) => void;
    setHeader: (name: string, value: string) => void;
  }
) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  // 1. Enforce POST method only
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST.",
    });
  }

  // 2. Validate Authorization Bearer Header
  const rawAuthHeader = req.headers["authorization"] || req.headers["Authorization"];
  const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Missing Authorization Bearer header.",
    });
  }

  // 3. Cryptographic Token Verification against Firestore
  const authVerification = await verifyConnectorToken(authHeader);
  if (!authVerification.valid || !authVerification.userId || !authVerification.connectorId) {
    return res.status(401).json({
      success: false,
      error: authVerification.error || "Unauthorized: Invalid or revoked connector token.",
    });
  }

  const userId = authVerification.userId;
  const connectorId = authVerification.connectorId;

  // 4. Validate Webhook Payload Body
  let payload: MT5WebhookPayload = req.body;

  // Parse if raw body string was received
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        error: "Malformed JSON payload from MT5 EA.",
      });
    }
  }

  if (!payload || !payload.account || !payload.account.login) {
    return res.status(400).json({
      success: false,
      error: "Invalid payload: 'account' object with 'login' is required.",
    });
  }

  try {
    // 5. Execute Idempotent Synchronization
    const result = await processMT5Webhook(userId, connectorId, payload);

    return res.status(200).json({
      success: true,
      message: "Synchronized successfully with Lootly Cloud.",
      accountKey: result.accountKey,
      processedPositions: result.processedPositions,
      processedDeals: result.processedDeals,
      processedEvents: result.processedEvents,
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[MT5 Webhook API] Error processing synchronization:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error processing MT5 synchronization.",
      serverTime: new Date().toISOString(),
    });
  }
}
