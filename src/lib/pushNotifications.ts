/**
 * Web Push Notification & In-Browser Alert Service for Lootly Meja Trading AI
 */
import { auth, db } from "./firebase";
import { doc, setDoc, deleteDoc } from "firebase/firestore";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return Notification.permission;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch (err) {
    console.warn("[Push] Error getting existing subscription:", err);
    return null;
  }
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.error("[Push] Service Worker registration failed:", err);
    return null;
  }
}

export async function subscribeToWebPush(userId?: string): Promise<{
  success: boolean;
  subscription?: PushSubscription;
  error?: string;
}> {
  if (!isPushSupported()) {
    return { success: false, error: "Browser tidak mendukung Web Push Notifications." };
  }

  try {
    // 1. Explicit permission request triggered by user interaction
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        success: false,
        error: permission === "denied" ? "Izin notifikasi ditolak oleh browser." : "Izin notifikasi dibatalkan.",
      };
    }

    // 2. Fetch server public VAPID key
    const keyRes = await fetch("/api/push/public-key");
    if (!keyRes.ok) {
      let extra = `status ${keyRes.status}`;
      try {
        const errJson = await keyRes.json();
        if (errJson.code === "VAPID_PUBLIC_KEY_MISSING") {
          extra = "VAPID_PUBLIC_KEY belum dikonfigurasi di server environment.";
        }
      } catch {}
      throw new Error(`Gagal mengambil kunci publik VAPID: ${extra}`);
    }
    const keyData = await keyRes.json();
    if (!keyData.publicKey) {
      throw new Error("Kunci VAPID tidak tersedia.");
    }

    // 3. Register service worker if not already registered
    let reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
    }

    // 4. Subscribe with PushManager
    const convertedKey = urlBase64ToUint8Array(keyData.publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });
    }

    // 5. Save to server backend
    const subJson = sub.toJSON();
    const effectiveUid = auth.currentUser?.uid || (userId && userId !== "guest_trader" ? userId : null);
    const saveRes = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subJson,
        userId: effectiveUid || userId || "guest_trader",
        deviceLabel: `${navigator.platform} (${navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop"})`,
      }),
    });

    if (!saveRes.ok) {
      throw new Error(`Gagal mendaftarkan endpoint push ke server: status ${saveRes.status}`);
    }

    // 6. Persist subscription document in Firestore for authenticated UID
    if (effectiveUid) {
      try {
        const subDocId = btoa(sub.endpoint).slice(-32).replace(/[/+=]/g, "_");
        await setDoc(
          doc(db, "users", effectiveUid, "pushSubscriptions", subDocId),
          {
            endpoint: sub.endpoint,
            keys: subJson.keys,
            deviceLabel: `${navigator.platform} (${navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop"})`,
            userId: effectiveUid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (fsErr) {
        console.warn("[Push] Firestore subscription sync notice:", fsErr);
      }
    }

    return { success: true, subscription: sub };
  } catch (err: any) {
    console.error("[Push] Subscription failed:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function unsubscribeFromWebPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return true;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });

      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        try {
          const subDocId = btoa(endpoint).slice(-32).replace(/[/+=]/g, "_");
          await deleteDoc(doc(db, "users", currentUid, "pushSubscriptions", subDocId));
        } catch (fsErr) {
          console.warn("[Push] Firestore delete subscription notice:", fsErr);
        }
      }
    }
    return true;
  } catch (err) {
    console.error("[Push] Unsubscribe failed:", err);
    return false;
  }
}

export async function triggerTestPushNotification(userId?: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: userId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, message: data.error || "Gagal mengirim tes notifikasi." };
    }
    return { success: true, message: data.message || "Tes push notifikasi berhasil dikirim!" };
  } catch (err: any) {
    return { success: false, message: err?.message || String(err) };
  }
}

export async function dispatchPushAlert(
  payload: {
    title: string;
    body: string;
    setupAnalysisId: string;
    direction: "BUY" | "SELL";
    type: "FORMING" | "VALID";
  },
  userId?: string
): Promise<{ sent: number; failed: number; skippedDuplicate?: boolean }> {
  try {
    const res = await fetch("/api/push/send-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          title: payload.title,
          body: payload.body,
          icon: "/icon.svg",
          badge: "/favicon.svg",
          tag: `lootly-${payload.setupAnalysisId}-${payload.type}`,
          data: {
            url: "/ai-desk",
            setupAnalysisId: payload.setupAnalysisId,
            direction: payload.direction,
            type: payload.type,
          },
        },
        targetUserId: userId,
      }),
    });
    if (!res.ok) {
      return { sent: 0, failed: 1 };
    }
    const data = await res.json();
    return {
      sent: data.sent || 0,
      failed: data.failed || 0,
      skippedDuplicate: data.skippedDuplicate || false,
    };
  } catch (err) {
    console.error("[Push] Failed to dispatch push alert:", err);
    return { sent: 0, failed: 1 };
  }
}

/**
 * Web Audio Synthesizer Tone for setup alerts
 * Deterministic audio synthesizer that works reliably across all browsers without external mp3 assets
 */
export function playAlertChime(type: "forming" | "valid" = "valid") {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === "valid") {
      // Crisp 3-note ascending institutional chime (C5 -> E5 -> G5)
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.36);
      });
    } else {
      // Soft 2-note attention chime (A4 -> D5)
      const now = ctx.currentTime;
      const notes = [440.0, 587.33]; // A4, D5
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);

        gain.gain.setValueAtTime(0, now + idx * 0.1);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.1 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.3);
      });
    }
  } catch (err) {
    console.warn("[Audio] Could not play alert chime:", err);
  }
}
