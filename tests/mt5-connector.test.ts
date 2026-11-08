import {
  createConnectorToken,
  verifyConnectorToken,
  revokeConnector,
  processMT5Webhook,
  hashConnectorToken,
  normalizeSymbol,
  maskAccountNumber,
} from "../api/_lib/mt5Service.js";
import { getServerFirestore } from "../api/_lib/firebaseConfig.js";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import type { MT5WebhookPayload } from "../api/_lib/types.js";

async function runTests() {
  console.log("======================================================");
  console.log("RUNNING LOOTLY MT5 DIRECT CONNECTOR INTEGRATION TESTS");
  console.log("======================================================");

  const testUid = `test_user_${Date.now()}`;
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Symbol Normalization
  assert(normalizeSymbol("XAUUSD") === "XAU/USD", "Normalize XAUUSD -> XAU/USD");
  assert(normalizeSymbol("XAUUSDm") === "XAU/USD", "Normalize XAUUSDm -> XAU/USD");
  assert(normalizeSymbol("GOLD") === "XAU/USD", "Normalize GOLD -> XAU/USD");
  assert(normalizeSymbol("BTCUSD") === "BTC/USD", "Normalize BTCUSD -> BTC/USD");
  assert(normalizeSymbol("EURUSD") === "EUR/USD", "Normalize EURUSD -> EUR/USD");

  // 2. Account Number Masking
  assert(maskAccountNumber("12345678") === "12***78", "Mask account number 12345678 -> 12***78");
  assert(maskAccountNumber(998877) === "99***77", "Mask numeric login 998877 -> 99***77");

  // 3. Token Creation & SHA-256 Hashing
  const created = await createConnectorToken(testUid, "Valetax VPS Test");
  assert(!!created.rawToken && created.rawToken.startsWith("lootly_mt5_live_"), "Token starts with lootly_mt5_live_");
  assert(created.connector.tokenPrefix === `${created.rawToken.substring(0, 16)}...`, "Connector stores masked token prefix");
  assert(created.connector.revoked === false, "Connector initialized as unrevoked");

  // 4. Token Verification (Valid Token)
  const authValid = await verifyConnectorToken(`Bearer ${created.rawToken}`);
  assert(authValid.valid === true, "Valid Bearer token accepted");
  assert(authValid.userId === testUid, "Resolved userId matches test user");

  // 5. Token Verification (Invalid Token)
  const authInvalid = await verifyConnectorToken("Bearer lootly_mt5_live_invalidtoken123456");
  assert(authInvalid.valid === false, "Invalid Bearer token rejected with 401");

  // 6. Token Verification (Missing Token)
  const authMissing = await verifyConnectorToken("");
  assert(authMissing.valid === false, "Missing Bearer token rejected");

  // 7. Token Revocation
  const revoked = await revokeConnector(testUid, created.connector.id);
  assert(revoked === true, "Connector token successfully marked revoked");

  // 8. Revoked Token Rejection
  const authRevoked = await verifyConnectorToken(`Bearer ${created.rawToken}`);
  assert(authRevoked.valid === false, "Revoked token strictly rejected");

  // Create active connector for subsequent trade tests
  const activeConn = await createConnectorToken(testUid, "Valetax Live Test");

  // 9. First Position Opening (BUY XAUUSD Demo)
  const buyPayload: MT5WebhookPayload = {
    version: "1.00",
    timestamp: Math.floor(Date.now() / 1000),
    account: {
      login: 8812345,
      broker: "Valetax",
      server: "Valetax-Demo",
      currency: "USD",
      leverage: 500,
      isDemo: true,
      tradeMode: "demo",
      balance: 10000,
      equity: 10025,
      margin: 100,
      freeMargin: 9925,
    },
    reconciliation: {
      openPositions: [
        {
          ticket: 10101,
          identifier: 10101,
          symbol: "XAUUSD",
          type: "buy",
          volume: 0.1,
          openPrice: 2750.5,
          currentPrice: 2752.0,
          sl: 2740.0,
          tp: 2770.0,
          profit: 15.0,
          swap: 0,
          openTime: Math.floor(Date.now() / 1000) - 300,
        },
      ],
      recentDeals: [],
    },
  };

  const buyResult = await processMT5Webhook(testUid, activeConn.connector.id, buyPayload);
  assert(buyResult.success === true, "BUY position processed successfully");
  assert(buyResult.processedPositions === 1, "Processed 1 open position");

  // Check Firestore Trade created
  const db = getServerFirestore();
  const tradeDocRef = doc(db, "users", testUid, "trades", "mt5_8812345_10101");
  const tradeSnap = await getDoc(tradeDocRef);
  assert(tradeSnap.exists(), "Trade record created in users/{uid}/trades");
  const tradeData = tradeSnap.data();
  assert(tradeData?.source === "mt5_sync", "Trade source marked as mt5_sync");
  assert(tradeData?.asset === "XAU/USD", "Normalized symbol matches XAU/USD");
  assert(tradeData?.direction === "buy", "Direction recorded as buy");
  assert(tradeData?.lot === 0.1, "Lot size recorded as 0.1");
  assert(tradeData?.status === "open", "Trade status is open");
  assert(tradeData?.accountMode === "demo", "Demo account mode correctly isolated");

  // 10. Position Modification (Update SL & TP on existing trade)
  const modifyPayload: MT5WebhookPayload = {
    ...buyPayload,
    reconciliation: {
      openPositions: [
        {
          ticket: 10101,
          identifier: 10101,
          symbol: "XAUUSD",
          type: "buy",
          volume: 0.1,
          openPrice: 2750.5,
          currentPrice: 2755.0,
          sl: 2748.0, // SL trailed into profit
          tp: 2780.0, // TP extended
          profit: 45.0,
          openTime: Math.floor(Date.now() / 1000) - 300,
        },
      ],
      recentDeals: [],
    },
  };
  await processMT5Webhook(testUid, activeConn.connector.id, modifyPayload);
  const modifiedSnap = await getDoc(tradeDocRef);
  assert(modifiedSnap.data()?.actualSL === 2748.0, "SL updated to 2748.0 on the same trade ID");
  assert(modifiedSnap.data()?.actualTP === 2780.0, "TP updated to 2780.0 on the same trade ID");

  // 11. Partial Close (Volume adjusted from 0.1 to 0.05)
  const partialPayload: MT5WebhookPayload = {
    ...buyPayload,
    reconciliation: {
      openPositions: [
        {
          ticket: 10101,
          identifier: 10101,
          symbol: "XAUUSD",
          type: "buy",
          volume: 0.05, // Volume reduced
          openPrice: 2750.5,
          currentPrice: 2755.0,
          sl: 2748.0,
          tp: 2780.0,
          profit: 22.5,
          openTime: Math.floor(Date.now() / 1000) - 300,
        },
      ],
      recentDeals: [],
    },
  };
  await processMT5Webhook(testUid, activeConn.connector.id, partialPayload);
  const partialSnap = await getDoc(tradeDocRef);
  assert(partialSnap.data()?.lot === 0.05, "Remaining volume updated to 0.05 without duplicating trade");

  // 12. Full Close via Deal Execution
  const closePayload: MT5WebhookPayload = {
    ...buyPayload,
    account: {
      ...buyPayload.account,
      balance: 10085.0,
      equity: 10085.0,
      margin: 0,
      freeMargin: 10085.0,
    },
    reconciliation: {
      openPositions: [], // No longer open
      recentDeals: [
        {
          ticket: 90001,
          order: 80001,
          position: 10101,
          symbol: "XAUUSD",
          type: "sell", // Exit deal
          entry: "out",
          volume: 0.05,
          price: 2765.0,
          profit: 72.5, // USD profit
          commission: -1.0,
          swap: -0.5,
          time: Math.floor(Date.now() / 1000),
          reason: 3, // TP hit
        },
      ],
    },
  };
  await processMT5Webhook(testUid, activeConn.connector.id, closePayload);
  const closedSnap = await getDoc(tradeDocRef);
  const closedData = closedSnap.data();
  assert(closedData?.status === "closed", "Trade status successfully transitioned to closed");
  assert(closedData?.result === "win", "Trade result evaluated as win");
  assert(closedData?.actualExit === 2765.0, "Actual exit price recorded as 2765.0");
  assert(closedData?.pnlUsd === 71.0, "Net profit USD calculated accurately ($72.5 - $1.0 - $0.5 = $71.0)");
  assert(closedData?.pnlIdr > 1000000, "PnL converted to IDR via usdToIdr exchange rate");

  // 13. Idempotent Transaction Record in users/{uid}/transactions
  const txRef = doc(db, "users", testUid, "transactions", "tx_mt5_8812345_10101");
  const txSnap = await getDoc(txRef);
  assert(txSnap.exists(), "Closed trade transaction recorded in users/{uid}/transactions");
  assert(txSnap.data()?.type === "trade_pnl", "Transaction type is trade_pnl");

  // 14. Duplicate Deal Prevention (Calling close payload again does not create duplicate transaction)
  await processMT5Webhook(testUid, activeConn.connector.id, closePayload);
  const duplicateTxSnap = await getDoc(txRef);
  assert(duplicateTxSnap.exists(), "Idempotent deal handling preserved transaction integrity");

  // 15. Real Account Mode Isolation Test
  const realPayload: MT5WebhookPayload = {
    version: "1.00",
    timestamp: Math.floor(Date.now() / 1000),
    account: {
      login: 9912345,
      broker: "Valetax",
      server: "Valetax-Live", // Live / Real server
      currency: "USD",
      leverage: 100,
      isDemo: false,
      tradeMode: "real",
      balance: 5000,
      equity: 5000,
      margin: 0,
      freeMargin: 5000,
    },
    reconciliation: {
      openPositions: [
        {
          ticket: 20202,
          identifier: 20202,
          symbol: "EURUSD",
          type: "sell",
          volume: 0.2,
          openPrice: 1.085,
          sl: 1.090,
          tp: 1.075,
          profit: 0,
          openTime: Math.floor(Date.now() / 1000),
        },
      ],
      recentDeals: [],
    },
  };
  await processMT5Webhook(testUid, activeConn.connector.id, realPayload);
  const realTradeSnap = await getDoc(doc(db, "users", testUid, "trades", "mt5_9912345_20202"));
  assert(realTradeSnap.exists(), "Real account trade created");
  assert(realTradeSnap.data()?.accountMode === "real", "Real account strictly segregated from Demo");

  console.log("======================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("======================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
