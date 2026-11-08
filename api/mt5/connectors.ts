import type { IncomingMessage, ServerResponse } from "http";
import { authenticateRequestUser } from "../_lib/authHelper.js";
import {
  createConnectorToken,
  listConnectors,
  revokeConnector,
  updateConnectorName,
} from "../_lib/mt5Service.js";

export default async function handler(
  req: IncomingMessage & {
    body?: any;
    query?: Record<string, string | string[]>;
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

  // Authenticate user via Firebase Auth ID Token
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  const authUser = await authenticateRequestUser(authHeader);

  if (!authUser || !authUser.uid) {
    return res.status(401).json({
      success: false,
      error: "Sesi login tidak valid atau telah kedaluwarsa. Silakan login kembali ke Lootly.",
    });
  }

  const userId = authUser.uid;

  try {
    // 1. GET: List User's Connectors
    if (req.method === "GET") {
      const connectors = await listConnectors(userId);
      return res.status(200).json({
        success: true,
        connectors,
      });
    }

    // 2. POST: Create New MT5 Connector Token
    if (req.method === "POST") {
      const body = req.body || {};
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Valetax MT5 VPS";
      const result = await createConnectorToken(userId, name);
      return res.status(201).json({
        success: true,
        connector: result.connector,
        rawToken: result.rawToken, // Sent ONLY once upon creation
      });
    }

    // 3. DELETE: Revoke MT5 Connector
    if (req.method === "DELETE") {
      const idFromQuery = typeof req.query?.id === "string" ? req.query.id : undefined;
      const idFromBody = typeof req.body?.id === "string" ? req.body.id : undefined;
      const connectorId = idFromQuery || idFromBody;

      if (!connectorId) {
        return res.status(400).json({
          success: false,
          error: "ID connector diperlukan untuk mencabut akses.",
        });
      }

      const revoked = await revokeConnector(userId, connectorId);
      if (!revoked) {
        return res.status(404).json({
          success: false,
          error: "Connector tidak ditemukan atau telah dicabut sebelumnya.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Konektor MT5 berhasil dicabut.",
      });
    }

    // 4. PATCH: Update Connector Name
    if (req.method === "PATCH") {
      const body = req.body || {};
      const connectorId = body.id;
      const newName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "";

      if (!connectorId || !newName) {
        return res.status(400).json({
          success: false,
          error: "ID connector dan nama baru diperlukan.",
        });
      }

      const updated = await updateConnectorName(userId, connectorId, newName);
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: "Connector tidak ditemukan.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Nama konektor berhasil diperbarui.",
      });
    }

    res.setHeader("Allow", "GET, POST, DELETE, PATCH");
    return res.status(405).json({
      success: false,
      error: "Metode tidak diizinkan. Gunakan GET, POST, DELETE, atau PATCH.",
    });
  } catch (err: any) {
    console.error("[MT5 Connectors API] Unhandled error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Terjadi kesalahan internal pada server.",
    });
  }
}
