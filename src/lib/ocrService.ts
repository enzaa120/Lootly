export type FieldConfidenceLevel = "detected" | "confirm" | "unreadable";

export interface ExtractedTradeData {
  marketType?: "forex" | "crypto";
  asset?: string;
  direction?: "buy" | "sell";
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  exitPrice?: number;
  lot?: number;
  isPositionOpen?: boolean;
  visiblePnl?: number;
  date?: string;
  time?: string;
  confidence?: "high" | "medium" | "low";
  overallConfidence?: "high" | "medium" | "low";
  fieldConfidence?: {
    asset?: FieldConfidenceLevel;
    direction?: FieldConfidenceLevel;
    entryPrice?: FieldConfidenceLevel;
    stopLoss?: FieldConfidenceLevel;
    takeProfit?: FieldConfidenceLevel;
    exitPrice?: FieldConfidenceLevel;
    lot?: FieldConfidenceLevel;
  };
  sourcePlatform?: string;
  rawNotes?: string;
  uncertainFields?: string[];
  detectedFields?: string[];
}

export interface OcrResponse {
  success: boolean;
  data?: ExtractedTradeData;
  error?: string;
}

/**
 * Sanitize error message to prevent leaking secrets, tokens, or base64 data.
 */
function sanitizeError(error: any): string {
  const str = String(error?.message || error || "Unknown error");
  return str
    .replace(/AIza[a-zA-Z0-9_\-]{10,}/g, "[REDACTED_API_KEY]")
    .replace(/key=[^&\s]+/gi, "key=[REDACTED]")
    .slice(0, 250);
}

/**
 * Safely downscales/compresses high-resolution images in the browser before upload,
 * preventing Vercel Edge 4.5MB request payload limit errors while preserving text clarity.
 */
export async function optimizeImageForOcr(
  dataUrl: string,
  preferredMime = "image/png",
  maxDimension = 1920,
  quality = 0.85
): Promise<{ base64: string; mimeType: string }> {
  // If data is already relatively small (< 1.5MB), use as is
  if (dataUrl.length < 1.5 * 1024 * 1024) {
    const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9-+.]+);base64,/);
    return {
      base64: dataUrl,
      mimeType: mimeMatch ? mimeMatch[1] : preferredMime,
    };
  }

  // If in a non-browser environment or window/Image not available
  if (typeof window === "undefined" || typeof Image === "undefined") {
    const mimeMatch = dataUrl.match(/^data:(image\/[a-zA-Z0-9-+.]+);base64,/);
    return {
      base64: dataUrl,
      mimeType: mimeMatch ? mimeMatch[1] : preferredMime,
    };
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ base64: dataUrl, mimeType: preferredMime });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Using image/jpeg for optimized payload size while maintaining high clarity for OCR text
        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({
          base64: compressedDataUrl,
          mimeType: "image/jpeg",
        });
      };

      img.onerror = () => {
        resolve({ base64: dataUrl, mimeType: preferredMime });
      };

      img.src = dataUrl;
    } catch {
      resolve({ base64: dataUrl, mimeType: preferredMime });
    }
  });
}

/**
 * Shared OCR / AI Extraction Service
 * Calls the backend /api/ocr-trade endpoint to parse screenshots contextually.
 * Used by both Dashboard quick action and Add Trade page.
 */
export async function analyzeScreenshot(imageBase64: string, mimeType = "image/png"): Promise<ExtractedTradeData> {
  // Pre-process and optimize image to ensure it stays well under Vercel 4.5MB payload limits
  const { base64: payloadImage, mimeType: payloadMime } = await optimizeImageForOcr(imageBase64, mimeType);

  // Temporary safe browser diagnostics required by specifications
  console.info("[OCR Client] Starting OCR request");
  console.info("[OCR Client] endpoint:", "/api/ocr-trade");
  console.info("[OCR Client] image size:", payloadImage.length);

  let response: Response;
  try {
    response = await fetch("/api/ocr-trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: payloadImage,
        mimeType: payloadMime,
      }),
    });
  } catch (networkErr: any) {
    const sanitized = sanitizeError(networkErr);
    console.error("[OCR Client] OCR request failed:", sanitized);
    throw new Error(`Koneksi jaringan ke endpoint OCR gagal: ${sanitized}`);
  }

  console.info("[OCR Client] response status:", response.status);

  let json: any = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      json = await response.json();
    } catch (parseErr: any) {
      const sanitized = sanitizeError(parseErr);
      console.error("[OCR Client] OCR request failed:", `Invalid JSON response: ${sanitized}`);
      throw new Error("Gagal membaca respons JSON dari server OCR.");
    }
  } else {
    const rawText = await response.text().catch(() => "");
    const sanitizedSnippet = sanitizeError(rawText.slice(0, 150));
    console.error("[OCR Client] OCR request failed:", `HTTP ${response.status} Non-JSON: ${sanitizedSnippet}`);
    throw new Error(`Server OCR mengembalikan error HTTP ${response.status}: ${sanitizedSnippet || "Non-JSON response"}`);
  }

  if (!response.ok || !json?.success) {
    const errorMsg = json?.error || `Gagal memproses analisis gambar OCR (HTTP ${response.status}).`;
    console.error("[OCR Client] OCR request failed:", errorMsg);
    throw new Error(errorMsg);
  }

  const raw = json.data || {};
  const detected: string[] = [];
  const uncertain: string[] = [];

  // Categorize detected vs uncertain fields
  if (raw.asset) detected.push("Pair / Aset");
  if (raw.direction) detected.push("Arah (Buy/Sell)");
  if (raw.entryPrice !== undefined && raw.entryPrice !== null) detected.push("Entry Price");
  if (raw.stopLoss !== undefined && raw.stopLoss !== null) detected.push("Stop Loss");
  if (raw.takeProfit !== undefined && raw.takeProfit !== null) detected.push("Take Profit");
  if (raw.exitPrice !== undefined && raw.exitPrice !== null) detected.push("Exit Price");
  if (raw.lot !== undefined && raw.lot !== null) detected.push("Lot Size");

  // Determine uncertainty based on confidence
  const conf = raw.overallConfidence || raw.confidence;
  if (conf === "low" || conf === "medium") {
    if (raw.stopLoss === undefined || raw.stopLoss === null) uncertain.push("Stop Loss");
    if (raw.takeProfit === undefined || raw.takeProfit === null) uncertain.push("Take Profit");
    if (raw.exitPrice === undefined || raw.exitPrice === null) uncertain.push("Exit Price");
  }

  return {
    ...raw,
    confidence: raw.overallConfidence || raw.confidence || "medium",
    detectedFields: detected,
    uncertainFields: uncertain,
  };
}
