import { doc, getDoc, setDoc, runTransaction } from "firebase/firestore";
import { getPushFirestore, sendPushNotification } from "./pushService.js";
import { getXauusdMarketData } from "./twelveData.js";
import {
  evaluateStrictXauusdSetup,
  checkXauusdMarketSchedule,
  formatPrice,
} from "./setupEngine.js";
import {
  SetupDecisionType,
  MonitorExecutionResult,
} from "./types.js";

const LOCK_TTL_MS = 60_000; // 60 seconds concurrency lock expiry

export async function executeMarketMonitor(options?: {
  forceMarketDataRefresh?: boolean;
}): Promise<MonitorExecutionResult> {
  const evaluatedAt = new Date().toISOString();
  console.log("[Monitor] XAUUSD started");

  const db = getPushFirestore();
  const lockRef = doc(db, "marketData", "XAUUSD", "monitor", "lock");
  const lockId = `lock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  let lockAcquired = false;

  // 1. Acquire Concurrency Lock
  try {
    lockAcquired = await runTransaction(db, async (tx) => {
      const snap = await tx.get(lockRef);
      const data = snap.data();
      const now = Date.now();

      if (data && data.locked === true && typeof data.expiresAt === "number" && now < data.expiresAt) {
        return false; // Still locked by an ongoing invocation
      }

      tx.set(
        lockRef,
        {
          locked: true,
          lockedAt: now,
          expiresAt: now + LOCK_TTL_MS,
          lockId,
        },
        { merge: true }
      );
      return true;
    });
  } catch (err) {
    console.warn("[Monitor] Failed to acquire concurrency lock:", err);
  }

  if (!lockAcquired) {
    console.log("[Monitor] skipped: concurrency lock active");
    return {
      ok: true,
      symbol: "XAUUSD",
      marketStatus: "open",
      setupAnalysisId: null,
      previousState: SetupDecisionType.NO_TRADE,
      currentState: SetupDecisionType.NO_TRADE,
      direction: null,
      pushSent: false,
      preAlertSent: false,
      upstreamRequestsMade: 0,
      evaluatedAt,
      skipped: true,
      reason: "Monitor execution already in progress (concurrency lock active)",
    };
  }

  try {
    // 2. Market Schedule Check
    const marketSchedule = checkXauusdMarketSchedule();
    if (!marketSchedule.isOpen) {
      console.log("[Monitor] market=closed");
      console.log("[Monitor] completed");
      return {
        ok: true,
        symbol: "XAUUSD",
        marketStatus: "closed",
        setupAnalysisId: null,
        previousState: SetupDecisionType.NO_TRADE,
        currentState: SetupDecisionType.NO_TRADE,
        direction: null,
        pushSent: false,
        preAlertSent: false,
        upstreamRequestsMade: 0,
        evaluatedAt,
        message: `Market is currently closed: ${marketSchedule.reason}`,
      };
    }
    console.log("[Monitor] market=open");

    // 3. Retrieve Multi-Timeframe Market Data (handles caching & Twelve Data quota cadence)
    const marketData = await getXauusdMarketData({
      force: options?.forceMarketDataRefresh || false,
    });

    const upstreamRequestsMade = marketData.upstreamRequestsMade || 0;

    // 4. Strict Setup Engine Evaluation
    const evaluation = evaluateStrictXauusdSetup(marketData.candles, {
      snapshots: marketData.snapshots,
      currentPrice: marketData.lastPrice,
      date: new Date(),
    });

    const currentState = evaluation.decision.decision;
    const prospectiveDirection = evaluation.prospectiveDirection;
    const setupAnalysisId = evaluation.setupAnalysisId;

    // 5. Read Existing Monitor State
    const stateRef = doc(db, "marketData", "XAUUSD", "monitor", "state");
    let previousState: SetupDecisionType = SetupDecisionType.NO_TRADE;
    let previousSetupId: string | null = null;
    let preAlertAlreadySent = false;
    let validAlertAlreadySent = false;

    try {
      const stateSnap = await getDoc(stateRef);
      if (stateSnap.exists()) {
        const d = stateSnap.data();
        previousState = d?.currentState || SetupDecisionType.NO_TRADE;
        previousSetupId = d?.setupAnalysisId || null;
        if (previousSetupId === setupAnalysisId) {
          preAlertAlreadySent = d?.preAlertSent === true;
          validAlertAlreadySent = d?.validAlertSent === true;
        }
      }
    } catch (err) {
      console.warn("[Monitor] Failed to read existing state:", err);
    }

    // 6. Check existing setup record in aiDeskAnalyses to avoid duplicate alerts across server restarts
    if (setupAnalysisId) {
      try {
        const analysisRef = doc(db, "aiDeskAnalyses", setupAnalysisId);
        const analysisSnap = await getDoc(analysisRef);
        if (analysisSnap.exists()) {
          const ad = analysisSnap.data();
          if (ad?.preAlertSent === true) preAlertAlreadySent = true;
          if (ad?.validAlertSent === true) validAlertAlreadySent = true;
        }
      } catch (err) {
        console.warn("[Monitor] Failed to inspect existing aiDeskAnalysis:", err);
      }
    }

    console.log(`[Monitor] state ${previousState} -> ${currentState}`);
    console.log(`[Monitor] setupAnalysisId=${setupAnalysisId || "none"}`);

    let pushSent = false;
    let preAlertSent = preAlertAlreadySent;
    let validAlertSent = validAlertAlreadySent;

    // 7. Notification State Transition Evaluation
    // Pre-alert on transition into SETUP_FORMING
    if (currentState === SetupDecisionType.SETUP_FORMING && !preAlertAlreadySent) {
      const title = "XAUUSD — SETUP FORMING";
      const body = `XAUUSD — Setup ${prospectiveDirection} sedang terbentuk. Menunggu retest M5.`;

      try {
        const pushResult = await sendPushNotification({
          title,
          body,
          data: {
            url: "/ai-desk",
            setupAnalysisId: setupAnalysisId || undefined,
            direction: prospectiveDirection,
            type: "FORMING",
            timeframe: "M5",
          },
        });
        pushSent = pushResult.sent > 0;
        preAlertSent = true;
      } catch (err) {
        console.warn("[Monitor] Pre-alert push delivery error:", err);
      }
    }

    // Valid setup push on transition into BUY_SETUP_VALID or SELL_SETUP_VALID
    const isValidState =
      currentState === SetupDecisionType.BUY_SETUP_VALID ||
      currentState === SetupDecisionType.SELL_SETUP_VALID;

    if (isValidState && !validAlertAlreadySent && evaluation.executionPlan) {
      const ep = evaluation.executionPlan;
      // Hard gate verification: entry, SL, TP1, RR >= 2.0
      const hasValidParams =
        typeof ep.entryLow === "number" &&
        typeof ep.entryHigh === "number" &&
        typeof ep.stopLoss === "number" &&
        typeof ep.tp1 === "number" &&
        typeof ep.rrToTp1 === "number" &&
        ep.rrToTp1 >= 2.0;

      if (hasValidParams) {
        const title = `XAUUSD — SETUP ${ep.direction} VALID`;
        const body = `Entry ${formatPrice(ep.entryLow)}–${formatPrice(ep.entryHigh)} | SL ${formatPrice(ep.stopLoss)} | TP1 ${formatPrice(ep.tp1)} | RR 1:${ep.rrToTp1}\nCek chart sebelum eksekusi.`;

        try {
          const pushResult = await sendPushNotification({
            title,
            body,
            data: {
              url: "/ai-desk",
              setupAnalysisId: setupAnalysisId || undefined,
              direction: ep.direction,
              type: "VALID",
              timeframe: "M5",
            },
          });
          pushSent = pushResult.sent > 0;
          validAlertSent = true;
        } catch (err) {
          console.warn("[Monitor] Valid setup push delivery error:", err);
        }
      }
    }

    // If setup became expired / invalidated
    if (currentState === SetupDecisionType.SETUP_EXPIRED && setupAnalysisId) {
      try {
        const analysisRef = doc(db, "aiDeskAnalyses", setupAnalysisId);
        await setDoc(
          analysisRef,
          {
            state: SetupDecisionType.SETUP_EXPIRED,
            invalidated: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn("[Monitor] Failed to invalidate expired record:", err);
      }
    }

    // 8. Persist Monitor State to Firestore
    try {
      await setDoc(
        stateRef,
        {
          setupAnalysisId,
          previousState,
          currentState,
          direction: prospectiveDirection,
          lastEvaluationAt: evaluatedAt,
          lastMarketTimestamp:
            marketData.candles.M5.slice(-1)[0]?.timestamp || Date.now(),
          preAlertSent,
          validAlertSent,
          expiredAlertSent: false,
          updatedAt: evaluatedAt,
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("[Monitor] Failed to save monitor state:", err);
    }

    // 9. Persist or Update aiDeskAnalyses Record
    if (setupAnalysisId && evaluation.recordData) {
      try {
        const analysisRef = doc(db, "aiDeskAnalyses", setupAnalysisId);
        await setDoc(
          analysisRef,
          {
            ...evaluation.recordData,
            preAlertSent,
            validAlertSent,
            updatedAt: evaluatedAt,
          },
          { merge: true }
        );
      } catch (err) {
        console.warn("[Monitor] Failed to save aiDeskAnalyses record:", err);
      }
    }

    console.log(`[Monitor] pushSent=${pushSent}`);
    console.log("[Monitor] completed");

    return {
      ok: true,
      symbol: "XAUUSD",
      marketStatus: "open",
      setupAnalysisId,
      previousState,
      currentState,
      direction: prospectiveDirection,
      pushSent,
      preAlertSent,
      validAlertSent,
      upstreamRequestsMade,
      evaluatedAt,
    };
  } finally {
    // 10. Safely Release Concurrency Lock
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(lockRef);
        if (snap.exists() && snap.data()?.lockId === lockId) {
          tx.set(
            lockRef,
            {
              locked: false,
              releasedAt: Date.now(),
            },
            { merge: true }
          );
        }
      });
    } catch (err) {
      console.warn("[Monitor] Failed to release concurrency lock:", err);
    }
  }
}
