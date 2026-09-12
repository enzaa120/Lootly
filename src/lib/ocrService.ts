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
 * Shared OCR / AI Extraction Service
 * Calls the backend /api/ocr-trade endpoint to parse screenshots contextually.
 * Used by both Dashboard quick action and Add Trade page.
 */
export async function analyzeScreenshot(imageBase64: string, mimeType = "image/png"): Promise<ExtractedTradeData> {
  const response = await fetch("/api/ocr-trade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64,
      mimeType,
    }),
  });

  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error || "Gagal memproses analisis gambar OCR.");
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
