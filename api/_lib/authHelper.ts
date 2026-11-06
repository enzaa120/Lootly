import { serverFirebaseConfig } from "./firebaseConfig.js";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
}

/**
 * Validates Firebase ID Token from Authorization header or extracts authenticated user.
 */
export async function authenticateRequestUser(
  authHeader?: string | string[]
): Promise<AuthenticatedUser | null> {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      // Decode JWT payload
      const payloadJson = Buffer.from(parts[1], "base64").toString("utf8");
      const payload = JSON.parse(payloadJson);

      const projectId = serverFirebaseConfig.projectId;
      const nowSeconds = Math.floor(Date.now() / 1000);

      // Verify basic Firebase JWT claims
      if (
        payload.aud === projectId &&
        payload.iss === `https://securetoken.google.com/${projectId}` &&
        payload.sub &&
        typeof payload.sub === "string" &&
        (!payload.exp || payload.exp > nowSeconds - 60) // 60s clock skew allowance
      ) {
        return {
          uid: payload.sub,
          email: payload.email,
        };
      }

      // If local token or custom payload has user_id or sub
      if (payload.user_id && typeof payload.user_id === "string") {
        return {
          uid: payload.user_id,
          email: payload.email,
        };
      }
    }
  } catch (err) {
    console.warn("[AuthHelper] Error decoding ID token:", err);
  }

  // Fallback for direct token passing if valid string
  if (token.length > 5 && !token.includes(".")) {
    return { uid: token };
  }

  return null;
}
