import crypto from "crypto";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { getPushFirestore } from "./pushService.js";
import type {
  MT5ConnectorInfo,
  MT5ConnectorTokenRecord,
  MT5AccountSummary,
  MT5PositionItem,
  MT5DealItem,
  MT5WebhookPayload,
  MT5PositionPayload,
  MT5DealPayload,
  MT5SyncEvent,
  MT5AccountMode,
} from "./types.js";

const DEFAULT_USD_TO_IDR = 15800;

/**
 * Removes undefined fields to prevent Firestore serialization errors.
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(obj: T): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => sanitizeFirestorePayload(item));

  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      if (typeof val === "object" && val !== null && !(val instanceof Date)) {
        cleaned[key] = sanitizeFirestorePayload(val);
      } else {
        cleaned[key] = val;
      }
    }
  }
  return cleaned;
}

/**
 * Normalizes MT5 symbol to Lootly asset format (e.g. XAUUSD -> XAU/USD).
 */
export function normalizeSymbol(rawSymbol: string): string {
  if (!rawSymbol) return "XAU/USD";
  const clean = rawSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Common gold symbols
  if (clean.startsWith("XAUUSD") || clean === "GOLD") return "XAU/USD";

  // Common crypto symbols
  if (clean.startsWith("BTC") || clean === "BITCOIN") return "BTC/USD";
  if (clean.startsWith("ETH") || clean === "ETHEREUM") return "ETH/USD";
  if (clean.startsWith("SOL") || clean === "SOLANA") return "SOL/USD";

  // Common Index symbols (do NOT slash indices like NAS/100 or SP/100)
  if (clean.includes("NAS100") || clean.includes("US100") || clean.includes("USTEC") || clean.includes("NDX")) return "NAS100";
  if (clean.includes("SP100")) return "SP100";
  if (clean.includes("SP500") || clean.includes("US500") || clean.includes("SPX")) return "US500";
  if (clean.includes("US30") || clean.includes("DJ30") || clean.includes("DOW") || clean.includes("WALLSTREET")) return "US30";
  if (clean.includes("GER40") || clean.includes("DAX")) return "DAX40";

  // Forex pairs
  if (clean.startsWith("EURUSD")) return "EUR/USD";
  if (clean.startsWith("GBPUSD")) return "GBP/USD";
  if (clean.startsWith("USDJPY")) return "USD/JPY";
  if (clean.startsWith("AUDUSD")) return "AUD/USD";
  if (clean.startsWith("USDCAD")) return "USD/CAD";
  if (clean.startsWith("USDCHF")) return "USD/CHF";
  if (clean.startsWith("NZDUSD")) return "NZD/USD";

  // General 6-char currency pair (letters only, e.g. EURGBP)
  if (clean.length === 6 && !/\d/.test(clean)) {
    return `${clean.substring(0, 3)}/${clean.substring(3, 6)}`;
  }

  return rawSymbol.trim();
}

/**
 * Masks account number for secure UI display (e.g. "12345678" -> "12***78").
 */
export function maskAccountNumber(login: string | number): string {
  const str = String(login);
  if (str.length <= 4) return str;
  return `${str.substring(0, 2)}***${str.substring(str.length - 2)}`;
}

/**
 * SHA-256 hash helper for connector tokens.
 */
export function hashConnectorToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Generate a new cryptographically secure MT5 connector token.
 * Returns the raw token once for the user to copy.
 */
export async function createConnectorToken(
  userId: string,
  name?: string
): Promise<{ connector: MT5ConnectorInfo; rawToken: string }> {
  if (!userId) {
    throw new Error("User ID is required to create an MT5 connector.");
  }

  const db = getPushFirestore();
  const connectorId = `mt5_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const rawToken = `lootly_mt5_live_${crypto.randomBytes(24).toString("hex")}`;
  const tokenHash = hashConnectorToken(rawToken);
  const now = new Date().toISOString();
  const tokenPrefix = `${rawToken.substring(0, 16)}...`;

  // 1. Global token mapping: mt5ConnectorTokens/{tokenHash}
  const tokenRecord: MT5ConnectorTokenRecord = {
    tokenHash,
    userId,
    connectorId,
    name: name || "Valetax MT5 VPS",
    createdAt: now,
    revoked: false,
  };
  await setDoc(doc(db, "mt5ConnectorTokens", tokenHash), tokenRecord);

  // 2. User connector metadata: users/{uid}/mt5Connectors/{connectorId}
  const connectorInfo: MT5ConnectorInfo = {
    id: connectorId,
    name: name || "Valetax MT5 VPS",
    tokenPrefix,
    tokenHash,
    createdAt: now,
    status: "disconnected",
    broker: "Valetax",
    revoked: false,
    updatedAt: now,
  };
  await setDoc(doc(db, "users", userId, "mt5Connectors", connectorId), connectorInfo);

  return { connector: connectorInfo, rawToken };
}

/**
 * List all MT5 connectors for a user, evaluating dynamic connection freshness.
 */
export async function listConnectors(userId: string): Promise<MT5ConnectorInfo[]> {
  if (!userId) return [];
  const db = getPushFirestore();
  const colRef = collection(db, "users", userId, "mt5Connectors");
  const snap = await getDocs(colRef);

  const list: MT5ConnectorInfo[] = [];
  const nowMs = Date.now();
  const STALE_HEARTBEAT_THRESHOLD_MS = 120_000; // 2 minutes

  snap.forEach((d) => {
    const data = d.data() as MT5ConnectorInfo;
    if (data.revoked) {
      data.status = "revoked";
    } else if (data.lastSyncAt) {
      const lastSyncMs = new Date(data.lastSyncAt).getTime();
      data.status = nowMs - lastSyncMs <= STALE_HEARTBEAT_THRESHOLD_MS ? "connected" : "disconnected";
    } else {
      data.status = "disconnected";
    }

    // Never leak tokenHash or secrets to frontend
    const { tokenHash, ...safeData } = data;
    list.push({ ...safeData, id: d.id });
  });

  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Revoke an MT5 connector token permanently.
 */
export async function revokeConnector(
  userId: string,
  connectorId: string
): Promise<boolean> {
  if (!userId || !connectorId) return false;
  const db = getPushFirestore();
  const connRef = doc(db, "users", userId, "mt5Connectors", connectorId);
  const snap = await getDoc(connRef);

  if (!snap.exists()) return false;
  const data = snap.data() as MT5ConnectorInfo;

  const now = new Date().toISOString();
  await setDoc(connRef, { revoked: true, status: "revoked", updatedAt: now }, { merge: true });

  if (data.tokenHash) {
    const tokenRef = doc(db, "mt5ConnectorTokens", data.tokenHash);
    await setDoc(tokenRef, { revoked: true, updatedAt: now }, { merge: true });
  }

  return true;
}

/**
 * Authenticate incoming MT5 Webhook request using Authorization Bearer token.
 * Strictly derives the verified userId from the token hash lookup.
 */
export async function verifyConnectorToken(
  rawBearerToken: string
): Promise<{ valid: boolean; userId?: string; connectorId?: string; error?: string }> {
  if (!rawBearerToken) {
    return { valid: false, error: "Missing authorization bearer token." };
  }

  const token = rawBearerToken.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { valid: false, error: "Empty authorization bearer token." };
  }

  const tokenHash = hashConnectorToken(token);
  const db = getPushFirestore();
  const tokenDocRef = doc(db, "mt5ConnectorTokens", tokenHash);
  const tokenSnap = await getDoc(tokenDocRef);

  if (!tokenSnap.exists()) {
    return { valid: false, error: "Connector token not found or invalid." };
  }

  const record = tokenSnap.data() as MT5ConnectorTokenRecord;
  if (record.revoked) {
    return { valid: false, error: "Connector token has been revoked." };
  }

  // Update last used timestamp
  setDoc(tokenDocRef, { lastUsedAt: new Date().toISOString() }, { merge: true }).catch(() => {});

  return { valid: true, userId: record.userId, connectorId: record.connectorId };
}

/**
 * Process MT5 webhook payload, synchronizing account summary, positions,
 * deals, and updating the primary Lootly Trade Journal.
 */
export async function processMT5Webhook(
  userId: string,
  connectorId: string,
  payload: MT5WebhookPayload
): Promise<{
  success: boolean;
  accountKey: string;
  processedPositions: number;
  processedDeals: number;
  processedEvents: number;
}> {
  if (!userId || !payload || !payload.account) {
    throw new Error("Invalid MT5 webhook payload: missing account data.");
  }

  const db = getPushFirestore();
  const now = new Date().toISOString();

  // 1. Account Identity & Isolation
  const login = payload.account.login;
  const loginStr = String(login);
  const broker = payload.account.broker || "Valetax";
  const server = payload.account.server || "Valetax-Live";
  const maskedLogin = maskAccountNumber(login);

  // Deterministic Demo/Real Mode
  const isDemo =
    payload.account.isDemo === true ||
    payload.account.tradeMode === "demo" ||
    server.toLowerCase().includes("demo") ||
    broker.toLowerCase().includes("demo");
  const accountMode: MT5AccountMode = isDemo ? "demo" : "real";

  const accountKey = `${broker.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${loginStr}_${accountMode}`;

  // 2. Fetch User Settings for USD to IDR conversion
  let usdToIdr = DEFAULT_USD_TO_IDR;
  try {
    const settingsSnap = await getDoc(doc(db, "users", userId, "settings", "current"));
    if (settingsSnap.exists()) {
      const s = settingsSnap.data();
      if (typeof s?.usdToIdr === "number" && s.usdToIdr > 0) {
        usdToIdr = s.usdToIdr;
      }
    }
  } catch (err) {
    console.warn("[MT5 Sync] Error reading user settings:", err);
  }

  // 3. Update Account Summary
  const accountRef = doc(db, "users", userId, "mt5Accounts", accountKey);
  const openPositionsCount = payload.reconciliation?.openPositions?.length ?? 0;

  const accountSummary: MT5AccountSummary = {
    accountKey,
    login,
    maskedLogin,
    broker,
    server,
    accountMode,
    currency: payload.account.currency || "USD",
    leverage: payload.account.leverage || 100,
    balance: payload.account.balance || 0,
    equity: payload.account.equity || 0,
    margin: payload.account.margin || 0,
    freeMargin: payload.account.freeMargin || 0,
    marginLevel: payload.account.marginLevel,
    openPositionsCount,
    lastSyncAt: now,
    updatedAt: now,
  };
  await setDoc(accountRef, sanitizeFirestorePayload(accountSummary), { merge: true });

  // 4. Update Connector Document Status
  const connectorRef = doc(db, "users", userId, "mt5Connectors", connectorId);
  await setDoc(
    connectorRef,
    sanitizeFirestorePayload({
      status: "connected",
      lastSyncAt: now,
      accountNumber: maskedLogin,
      broker,
      server,
      accountMode,
      currency: payload.account.currency || "USD",
      leverage: payload.account.leverage || 100,
      balance: payload.account.balance || 0,
      equity: payload.account.equity || 0,
      openPositionsCount,
      version: payload.version || "1.00",
      updatedAt: now,
    }),
    { merge: true }
  );

  let processedPositions = 0;
  let processedDeals = 0;
  let processedEvents = 0;

  const currentOpenTicketSet = new Set<string>();

  // 5. Reconcile Open Positions
  if (Array.isArray(payload.reconciliation?.openPositions)) {
    for (const pos of payload.reconciliation.openPositions) {
      const uniqueTicket = pos.ticket || pos.identifier;
      if (!uniqueTicket) continue;
      const positionIdentifier = pos.identifier || uniqueTicket;

      currentOpenTicketSet.add(String(uniqueTicket));
      currentOpenTicketSet.add(String(positionIdentifier));

      const symbol = normalizeSymbol(pos.symbol);
      const direction: "buy" | "sell" =
        pos.type === 0 || pos.type === "buy" ? "buy" : "sell";
      const lot = pos.volume || 0;
      const openPrice = pos.openPrice || 0;
      const sl = pos.sl || 0;
      const tp = pos.tp || 0;
      const profitUsd = pos.profit || 0;
      const swapUsd = pos.swap || 0;

      const openTimeIso = pos.openTime
        ? typeof pos.openTime === "number"
          ? new Date(pos.openTime * 1000).toISOString()
          : new Date(pos.openTime).toISOString()
        : now;

      // A. Store raw position record in mt5Accounts subcollection
      const posDocRef = doc(
        db,
        "users",
        userId,
        "mt5Accounts",
        accountKey,
        "positions",
        String(uniqueTicket)
      );
      const positionItem: MT5PositionItem = {
        ticket: uniqueTicket,
        identifier: positionIdentifier,
        symbol,
        direction,
        volume: lot,
        openPrice,
        currentPrice: pos.currentPrice || openPrice,
        sl,
        tp,
        profit: profitUsd,
        swap: swapUsd,
        openTime: openTimeIso,
        comment: pos.comment,
        magic: pos.magic,
        updatedAt: now,
      };
      await setDoc(posDocRef, sanitizeFirestorePayload(positionItem), { merge: true });

      // B. Create/Update primary Trade in users/{uid}/trades/{tradeId}
      // Using uniqueTicket guarantees multi-layer positions never overwrite each other!
      const tradeId = `mt5_${loginStr}_${uniqueTicket}`;
      const tradeDocRef = doc(db, "users", userId, "trades", tradeId);
      const existingTradeSnap = await getDoc(tradeDocRef);

      const tradeDate = openTimeIso.split("T")[0];
      const tradeTime = openTimeIso.split("T")[1]?.substring(0, 5) || "00:00";
      const isCrypto = symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("SOL");

      if (!existingTradeSnap.exists()) {
        // New Open Trade
        const newTradePayload = {
          id: tradeId,
          userId,
          accountMode,
          marketType: isCrypto ? "crypto" : "forex",
          status: "open",
          result: "open",
          date: tradeDate,
          time: tradeTime,
          asset: symbol,
          direction,
          lot,
          entryPlan: openPrice,
          actualEntry: openPrice,
          actualSL: sl > 0 ? sl : null,
          actualTP: tp > 0 ? tp : null,
          pnlIdr: 0,
          pnlUsd: profitUsd,
          floatingProfitUsd: profitUsd,
          swap: swapUsd,
          pnlPercent: 0,
          rrPlanned: 0,
          rrRealized: 0,
          setupType: "Valetax MT5",
          entryReason: `Eksekusi otomatis Valetax MT5 #${uniqueTicket}`,
          mistakes: [],
          source: "mt5_sync",
          broker,
          mt5Server: server,
          accountNumber: maskedLogin,
          mt5PositionTicket: uniqueTicket,
          mt5PositionIdentifier: positionIdentifier,
          magicNumber: pos.magic || null,
          comment: pos.comment || null,
          createdAt: openTimeIso,
          updatedAt: now,
        };
        await setDoc(tradeDocRef, sanitizeFirestorePayload(newTradePayload), { merge: true });
      } else {
        // Existing trade: Update modifications & current floating profit
        const updatePayload: Record<string, any> = {
          lot,
          pnlUsd: profitUsd,
          floatingProfitUsd: profitUsd,
          swap: swapUsd,
          updatedAt: now,
        };
        if (sl > 0) updatePayload.actualSL = sl;
        if (tp > 0) updatePayload.actualTP = tp;
        await setDoc(tradeDocRef, sanitizeFirestorePayload(updatePayload), { merge: true });
      }

      processedPositions++;
    }
  }

  // Gather all deals from both reconciliation.recentDeals and real-time events
  const combinedDealsMap = new Map<string, MT5DealPayload>();

  if (Array.isArray(payload.reconciliation?.recentDeals)) {
    for (const d of payload.reconciliation.recentDeals) {
      if (d && d.ticket) combinedDealsMap.set(String(d.ticket), d);
    }
  }

  if (Array.isArray(payload.events)) {
    for (const ev of payload.events) {
      processedEvents++;
      if (ev.type === "deal" && ev.data) {
        try {
          const dealObj: MT5DealPayload = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
          if (dealObj && dealObj.ticket) {
            combinedDealsMap.set(String(dealObj.ticket), dealObj);
          }
        } catch (e) {
          console.warn("[MT5 Sync] Failed to parse event deal data:", e);
        }
      }
    }
  }

  const combinedDeals = Array.from(combinedDealsMap.values());

  // 6. Reconcile Closed Deals
  for (const deal of combinedDeals) {
    const dealTicket = deal.ticket;
    const positionIdentifier = deal.position || dealTicket;
    if (!dealTicket) continue;

    const symbol = normalizeSymbol(deal.symbol);
    const direction: "buy" | "sell" =
      deal.type === 0 || deal.type === "buy" ? "buy" : "sell";
    const lot = deal.volume || 0;
    const price = deal.price || 0;
    const profitUsd = deal.profit || 0;
    const commissionUsd = deal.commission || 0;
    const swapUsd = deal.swap || 0;
    const entryTypeStr =
      deal.entry === 1 || deal.entry === "out"
        ? "out"
        : deal.entry === 2 || deal.entry === "inout"
        ? "inout"
        : deal.entry === 0 || deal.entry === "in"
        ? "in"
        : "out";

    const dealTimeIso = deal.time
      ? typeof deal.time === "number"
        ? new Date(deal.time * 1000).toISOString()
        : new Date(deal.time).toISOString()
      : now;

    // Store deal record in mt5Accounts subcollection
    const dealDocRef = doc(
      db,
      "users",
      userId,
      "mt5Accounts",
      accountKey,
      "deals",
      String(dealTicket)
    );
    const dealItem: MT5DealItem = {
      dealTicket,
      orderTicket: deal.order,
      positionIdentifier,
      symbol,
      direction,
      volume: lot,
      price,
      profit: profitUsd,
      commission: commissionUsd,
      swap: swapUsd,
      time: dealTimeIso,
      entryType: entryTypeStr as any,
      reason: String(deal.reason || ""),
      comment: deal.comment,
      magic: deal.magic || null,
      createdAt: now,
    };
    await setDoc(dealDocRef, sanitizeFirestorePayload(dealItem), { merge: true });

    // If deal is an exit deal, finalize and close the matching Trade
    if (entryTypeStr === "out" || entryTypeStr === "inout") {
      const netProfitUsd = Number((profitUsd + commissionUsd + swapUsd).toFixed(2));
      const pnlIdr = Math.round(netProfitUsd * usdToIdr);
      const tradeResult = netProfitUsd > 0.05 ? "win" : netProfitUsd < -0.05 ? "loss" : "breakeven";

      // Try locating by position ticket, identifier, or order ticket
      const possibleTradeIds = [
        `mt5_${loginStr}_${positionIdentifier}`,
        deal.order ? `mt5_${loginStr}_${deal.order}` : null,
      ].filter(Boolean) as string[];

      let matchedTradeDocRef = null;
      let matchedTradeData: any = null;

      for (const tId of possibleTradeIds) {
        const trRef = doc(db, "users", userId, "trades", tId);
        const trSnap = await getDoc(trRef);
        if (trSnap.exists()) {
          matchedTradeDocRef = trRef;
          matchedTradeData = trSnap.data();
          break;
        }
      }

      const targetTradeRef = matchedTradeDocRef || doc(db, "users", userId, "trades", possibleTradeIds[0]);

      if (matchedTradeData) {
        const entryPrice = matchedTradeData.actualEntry || price;
        let calculatedRR = 0;
        if (matchedTradeData.actualSL && Math.abs(entryPrice - matchedTradeData.actualSL) > 0) {
          calculatedRR = Number(
            (Math.abs(price - entryPrice) / Math.abs(entryPrice - matchedTradeData.actualSL)).toFixed(2)
          );
        }

        await setDoc(
          targetTradeRef,
          sanitizeFirestorePayload({
            status: "closed",
            result: tradeResult,
            actualExit: price,
            pnlIdr,
            pnlUsd: netProfitUsd,
            floatingProfitUsd: 0,
            commission: commissionUsd,
            swap: swapUsd,
            rrRealized: calculatedRR,
            mt5DealTicket: dealTicket,
            closeTime: dealTimeIso,
            updatedAt: now,
          }),
          { merge: true }
        );

        // Add transaction to users/{uid}/transactions idempotently
        const txDocRef = doc(db, "users", userId, "transactions", `tx_${targetTradeRef.id}`);
        await setDoc(
          txDocRef,
          sanitizeFirestorePayload({
            id: `tx_${targetTradeRef.id}`,
            userId,
            accountMode,
            type: "trade_pnl",
            amount: pnlIdr,
            amountUsd: netProfitUsd,
            note: `${symbol} (${direction.toUpperCase()}) - ${tradeResult.toUpperCase()}`,
            date: dealTimeIso.split("T")[0],
            relatedTradeId: targetTradeRef.id,
          }),
          { merge: true }
        );
      } else {
        // Trade was not in database (e.g. opened before connector was active)
        const isCrypto = symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("SOL");
        await setDoc(
          targetTradeRef,
          sanitizeFirestorePayload({
            id: targetTradeRef.id,
            userId,
            accountMode,
            marketType: isCrypto ? "crypto" : "forex",
            status: "closed",
            result: tradeResult,
            date: dealTimeIso.split("T")[0],
            time: dealTimeIso.split("T")[1]?.substring(0, 5) || "00:00",
            asset: symbol,
            direction,
            lot,
            actualEntry: price,
            actualExit: price,
            pnlIdr,
            pnlUsd: netProfitUsd,
            floatingProfitUsd: 0,
            commission: commissionUsd,
            swap: swapUsd,
            rrPlanned: 0,
            rrRealized: 0,
            setupType: "Valetax MT5",
            entryReason: `Eksekusi Valetax MT5 #${positionIdentifier}`,
            mistakes: [],
            source: "mt5_sync",
            broker,
            mt5Server: server,
            accountNumber: maskedLogin,
            mt5PositionTicket: positionIdentifier,
            mt5DealTicket: dealTicket,
            createdAt: dealTimeIso,
            closeTime: dealTimeIso,
            updatedAt: now,
          }),
          { merge: true }
        );
      }
    }

    processedDeals++;
  }

  // 7. Auto-close trades that are no longer active in MT5
  // If an open trade exists in Lootly for this account but is absent from currentOpenTickets,
  // it has been closed in MT5. We match with recent deals or mark it closed immediately.
  try {
    const openTradesQuery = query(
      collection(db, "users", userId, "trades"),
      where("source", "==", "mt5_sync"),
      where("status", "==", "open"),
      where("accountNumber", "==", maskedLogin)
    );
    const openTradesSnap = await getDocs(openTradesQuery);

    for (const tDoc of openTradesSnap.docs) {
      const tr = tDoc.data();
      const posTicketStr = String(tr.mt5PositionTicket || "");
      const posIdStr = String(tr.mt5PositionIdentifier || "");

      // If position is not in MT5 open positions anymore, it is closed!
      const isStillOpen = currentOpenTicketSet.has(posTicketStr) || currentOpenTicketSet.has(posIdStr);
      if (!isStillOpen && currentOpenTicketSet.size >= 0) {
        // Find matching exit deal
        const matchingDeal = combinedDeals.find(
          (d) =>
            (String(d.position) === posTicketStr ||
              String(d.position) === posIdStr ||
              String(d.order) === posTicketStr) &&
            (d.entry === 1 || d.entry === "out" || d.entry === 2 || d.entry === "inout")
        );

        if (matchingDeal) {
          const profitUsd = matchingDeal.profit || 0;
          const commUsd = matchingDeal.commission || 0;
          const swapUsd = matchingDeal.swap || 0;
          const netUsd = Number((profitUsd + commUsd + swapUsd).toFixed(2));
          const pnlIdr = Math.round(netUsd * usdToIdr);
          const tradeResult = netUsd > 0.05 ? "win" : netUsd < -0.05 ? "loss" : "breakeven";

          await setDoc(
            tDoc.ref,
            sanitizeFirestorePayload({
              status: "closed",
              result: tradeResult,
              actualExit: matchingDeal.price || tr.actualEntry,
              pnlUsd: netUsd,
              pnlIdr,
              floatingProfitUsd: 0,
              commission: commUsd,
              swap: swapUsd,
              mt5DealTicket: matchingDeal.ticket,
              closeTime: now,
              updatedAt: now,
            }),
            { merge: true }
          );
        } else {
          // Deal not found yet, mark closed with last known floating profit
          const floatUsd = tr.floatingProfitUsd || tr.pnlUsd || 0;
          const netUsd = Number(floatUsd.toFixed(2));
          const pnlIdr = Math.round(netUsd * usdToIdr);
          const tradeResult = netUsd > 0.05 ? "win" : netUsd < -0.05 ? "loss" : "breakeven";

          await setDoc(
            tDoc.ref,
            sanitizeFirestorePayload({
              status: "closed",
              result: tradeResult,
              actualExit: tr.actualEntry,
              pnlUsd: netUsd,
              pnlIdr,
              floatingProfitUsd: 0,
              closeTime: now,
              updatedAt: now,
            }),
            { merge: true }
          );
        }
      }
    }
  } catch (reconcileErr) {
    console.warn("[MT5 Sync] Open trade reconciliation notice:", reconcileErr);
  }

  return {
    success: true,
    accountKey,
    processedPositions,
    processedDeals,
    processedEvents,
  };
}
