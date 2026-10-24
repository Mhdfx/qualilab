"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  IDLE_LOGIN_HREF,
  IDLE_STORAGE_KEY,
  expiredOnArrival,
  formatIdleCountdown,
  idleState,
  readLastActivity,
  shouldRecordActivity,
} from "@/lib/idle-policy";
import {
  SERVER_TOUCH_RETRY_MS,
  SERVER_TOUCH_TIMEOUT_MS,
  shouldTouchServer,
  touchOutcome,
  type TouchOutcome,
} from "@/lib/session-idle";

/** What counts as someone at the keyboard. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** The stored last activity as written; null when storage is unavailable (private window, blocked site data). */
function readSharedRaw(): string | null {
  try {
    return window.localStorage.getItem(IDLE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Reads the last activity another tab wrote; null when there is none or storage is unavailable. */
function readShared(now: number): number | null {
  return readLastActivity(readSharedRaw(), now);
}

/** Shares an activity with the other tabs; a blocked storage only loses the sharing, never the rule. */
function writeShared(at: number): void {
  try {
    window.localStorage.setItem(IDLE_STORAGE_KEY, String(at));
  } catch {
    // Each tab then keeps its own clock.
  }
}

/**
 * Called by the sign-in page once the sign-in succeeded: the new session
 * starts its clock now, so the last activity a previous user left in this
 * browser never closes it on arrival (`expiredOnArrival`).
 */
export function recordSignIn(): void {
  writeShared(Date.now());
}

/**
 * Signs a shared laboratory PC out after `timeoutMs` without activity
 * (`idle-policy.ts`): a click, a key, the wheel or a touch in ANY tab of the
 * application resets the clock — tabs share it through localStorage and
 * its `storage` event. Two minutes before the end, a dialog offers
 * « Rester connecté » (in every open tab; one answer closes them all); at
 * the end the session is closed and the sign-in page says why
 * (`/login?motif=inactivite`).
 *
 * Coming back to a hidden tab (`visibilitychange`) is not an activity: it
 * re-checks the clock, so a PC woken after the limit signs out at once. So
 * does opening a page: when the last activity any tab recorded is older
 * than the limit — the tab was closed without « Déconnexion », the session
 * cookie still valid — the session is closed on arrival instead of being
 * handed to the next person at the PC.
 *
 * The server closes an idle session too, 5 minutes after the browser would
 * (session-idle.ts): it knows of the activity through requests, so this tab
 * reports it (`touchServer`) — at every page it opens, whether or not the
 * page came from the server (Back may restore a page from the browser's
 * cache with no request), then every 2 minutes while someone works in a page
 * that sends none — a long entry — and « Rester connecté » at once. A report
 * that failed is sent again by a timer, without waiting for an activity.
 */
export function IdleLogout({ timeoutMs }: { timeoutMs: number }) {
  const router = useRouter();
  const lastActivity = useRef(0);
  const lastWritten = useRef(0);
  const lastTouch = useRef(0);
  const lastTouchAttempt = useRef(0);
  const touching = useRef(false);
  const retryTimer = useRef<number | null>(null);
  const mounted = useRef(false);
  const signingOut = useRef(false);
  const warningShown = useRef(false);
  const stayButton = useRef<HTMLButtonElement>(null);
  const [warningLeft, setWarningLeft] = useState<number | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  /**
   * Tells the server the person is still here: Better Auth's session read
   * stamps the session with this request (session-idle.ts). What the answer
   * means is `touchOutcome`: stamped; unknown — an error, no answer within
   * `SERVER_TOUCH_TIMEOUT_MS` — sent again `SERVER_TOUCH_RETRY_MS` later by
   * a timer; no session — closed on the server meanwhile: its idle bound, an
   * administrator's reset, « Déconnexion » in another tab — the sign-in page,
   * since nothing more can be saved from here. By way of « / »: its guard
   * says why (`signedOutPath` — « inactivité », the administrator's reset,
   * the password changed elsewhere; nothing after « Déconnexion »), the
   * touch having left the cookie that tells it (session-idle-server.ts).
   */
  const touchServer = useCallback(
    async function touch(): Promise<void> {
      if (touching.current || signingOut.current) return;
      touching.current = true;
      if (retryTimer.current !== null) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      const sentAt = Date.now();
      lastTouchAttempt.current = sentAt;
      let outcome: TouchOutcome = "retry";
      try {
        outcome = touchOutcome(
          await authClient.getSession({ fetchOptions: { signal: AbortSignal.timeout(SERVER_TOUCH_TIMEOUT_MS) } })
        );
      } catch {
        // Network down, or no answer in time: retried below.
      } finally {
        touching.current = false;
      }
      if (signingOut.current || !mounted.current) return;
      if (outcome === "stamped") {
        lastTouch.current = sentAt;
      } else if (outcome === "retry") {
        retryTimer.current = window.setTimeout(() => {
          retryTimer.current = null;
          void touch();
        }, SERVER_TOUCH_RETRY_MS);
      } else {
        signingOut.current = true;
        setWarningLeft(null);
        router.replace("/");
        router.refresh();
      }
    },
    [router]
  );

  /**
   * Restarts the clock at `now` and shares it (`force`: whatever the
   * throttles — « Rester connecté » reaches the server at once,
   * `shouldTouchServer`).
   */
  const restart = useCallback(
    (force: boolean) => {
      if (signingOut.current) return;
      const now = Date.now();
      lastActivity.current = now;
      if (force || shouldRecordActivity(lastWritten.current, now)) {
        lastWritten.current = now;
        writeShared(now);
      }
      if (shouldTouchServer(force, lastTouch.current, lastTouchAttempt.current, now)) void touchServer();
      warningShown.current = false;
      setWarningLeft(null);
    },
    [touchServer]
  );

  /**
   * A click, a key, the wheel or a touch on the page. Ignored while the
   * warning is open: only « Rester connecté » closes it, so a click meant
   * for the dialog never falls through to the page under it.
   */
  const recordActivity = useCallback(() => {
    if (warningShown.current) return;
    restart(false);
  }, [restart]);

  const stayConnected = useCallback(() => restart(true), [restart]);

  useEffect(() => {
    const signOut = async () => {
      if (signingOut.current) return;
      signingOut.current = true;
      setWarningLeft(null);
      let closed = false;
      try {
        const result = await authClient.signOut();
        closed = !result?.error;
      } catch {
        closed = false;
      }
      if (!closed) {
        // The session survived (network or server error): the sign-in page
        // sends the user back to their dashboard. That page starts on a
        // fresh clock — the next expiry tries again — rather than closing
        // on arrival over and over.
        writeShared(Date.now());
      }
      router.replace(IDLE_LOGIN_HREF);
      router.refresh();
    };

    const tick = () => {
      if (signingOut.current) return;
      const state = idleState(lastActivity.current, Date.now(), timeoutMs);
      if (state.phase === "EXPIRED") {
        void signOut();
        return;
      }
      warningShown.current = state.phase === "WARNING";
      setWarningLeft(state.phase === "WARNING" ? state.msLeft : null);
    };

    const adoptShared = (value: number | null) => {
      if (value !== null && value > lastActivity.current) lastActivity.current = value;
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== IDLE_STORAGE_KEY) return;
      adoptShared(readLastActivity(event.newValue, Date.now()));
      tick();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      adoptShared(readShared(Date.now()));
      tick();
    };

    // Opening a page is an activity — unless the session was already idle
    // past the limit when the page opened (tab closed without signing out).
    mounted.current = true;
    const start = Date.now();
    if (expiredOnArrival(readSharedRaw(), start, timeoutMs)) {
      void signOut();
    } else {
      lastActivity.current = start;
      lastWritten.current = start;
      writeShared(start);
      // An activity, so the server hears of it too: the page may come from
      // the browser's cache (Back) with no request that stamped the session.
      // After a full load its guard did — the touch then writes nothing
      // (Better Auth's update age).
      void touchServer();
    }

    const options: AddEventListenerOptions = { capture: true, passive: true };
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, recordActivity, options);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(tick, 1000);

    return () => {
      mounted.current = false;
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, recordActivity, options);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
      if (retryTimer.current !== null) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [timeoutMs, router, recordActivity, touchServer]);

  const warningOpen = warningLeft !== null;
  useEffect(() => {
    if (!warningOpen) return;
    stayButton.current?.focus();
    // A modal with one button: Tab never leaves it for the page beneath.
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      stayButton.current?.focus();
    };
    window.addEventListener("keydown", keepFocus, true);
    return () => window.removeEventListener("keydown", keepFocus, true);
  }, [warningOpen]);

  if (warningLeft === null) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              Vous allez être déconnecté pour inactivité
            </h2>
            <p id={descriptionId} className="mt-1 text-sm text-slate-600">
              Sans action de votre part, la session se ferme dans{" "}
              <span className="font-semibold tabular-nums text-slate-900">{formatIdleCountdown(warningLeft)}</span>.
            </p>
          </div>
        </div>
        <button
          ref={stayButton}
          type="button"
          onClick={stayConnected}
          className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
        >
          Rester connecté
        </button>
      </div>
    </div>
  );
}
