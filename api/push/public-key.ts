import dotenv from "dotenv";

dotenv.config();

export const maxDuration = 10;

export default function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  // Support GET and HEAD
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({
      ok: false,
      error: `Method '${req.method}' not allowed. Use GET to retrieve public key.`,
    });
  }

  // Read only the public key from process.env
  const publicKey = process.env.VAPID_PUBLIC_KEY;

  if (!publicKey) {
    return res.status(500).json({
      ok: false,
      code: "VAPID_PUBLIC_KEY_MISSING",
    });
  }

  return res.status(200).json({
    ok: true,
    publicKey,
  });
}
