"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hand, Inbox, UserRoundCog } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { takeOverConfirmation } from "@/lib/take-over";

/**
 * « Prendre en charge », « Libérer » and « Reprendre » at the bench — the
 * « prise en charge libre » of 13/10 (PROGRAMME.md §10.2, §10.3) and the
 * take-over of a colleague's sample (re-ask 2.13, C3).
 *
 * Two small client islands, so the bench lists and the sheet stay server
 * components. The server decides everything (`POST` / `DELETE
 * /api/samples/[id]/take`): the first technician wins, the second reads
 * « Déjà pris par X. ». Each button stays busy until the screen it leads
 * to has re-rendered, so it never flashes back to clickable on a stale row.
 */

const NETWORK_ERROR = "Une erreur réseau est survenue. Réessayez.";

/** The keyboard ring of the brand, added to the shared buttons. */
const FOCUS_RING = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

/** The answer of the take route, its French message when it refused. `body`: the take-over's holder. */
async function callTake(sampleId: string, method: "POST" | "DELETE" | "PATCH", body?: { holderId: string }) {
  const response = await fetch(
    `/api/samples/${sampleId}/take`,
    body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method }
  );
  const data: unknown = await response.json().catch(() => null);
  const error =
    data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : null;
  return { ok: response.ok, status: response.status, error };
}

/** The bench changed under the screen: someone took it, released it, or it left the bench. */
function isStale(status: number) {
  return status === 403 || status === 404 || status === 409;
}

function ActionError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 text-sm font-medium text-rose-700">
      {message}
    </p>
  );
}

/**
 * « Prendre en charge » — the technician becomes the sample's holder.
 * `openAfter` opens the sheet once it is taken (from a list); without it
 * the current screen re-renders (on the sheet itself). A refusal is shown
 * beside the button and the screen re-renders: the row or the sheet then
 * says who holds the sample.
 */
export function TakeButton({
  sampleId,
  openAfter = false,
  className = "",
}: {
  sampleId: string;
  openAfter?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [error, setError] = useState("");
  const busy = sending || navigating;

  async function take() {
    if (busy) return;
    setSending(true);
    setError("");
    try {
      const answer = await callTake(sampleId, "POST");
      if (!answer.ok) {
        setError(answer.error ?? "Impossible de prendre cet échantillon en charge.");
        if (isStale(answer.status)) {
          // In a list the refreshed row moves to « Pris par un collègue » and
          // this button with it: the reason stays readable a moment first.
          const refresh = () => startNavigation(() => router.refresh());
          if (openAfter) window.setTimeout(refresh, 2500);
          else refresh();
        }
        return;
      }
      startNavigation(() => {
        router.refresh();
        if (openAfter) router.push(`/technicien/${sampleId}`);
      });
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={className}>
      <PrimaryButton
        type="button"
        onClick={take}
        disabled={busy}
        aria-busy={busy}
        className={`w-full sm:w-auto ${FOCUS_RING}`}
      >
        <Hand className="h-4 w-4" aria-hidden="true" />
        {busy ? "Prise en charge…" : "Prendre en charge"}
      </PrimaryButton>
      <ActionError message={error} />
    </div>
  );
}

/**
 * « Libérer » — gives the sample back to « À prendre », after a
 * confirmation. Its holder or an administrator, while nothing is typed on
 * it; the server re-checks both under the row lock. Done, the bench opens
 * (the sample is anyone's again); refused, the reason stays beside the
 * button.
 */
export function ReleaseButton({ sampleId, className = "" }: { sampleId: string; className?: string }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [error, setError] = useState("");
  const busy = sending || navigating;

  async function release() {
    if (busy) return;
    if (!window.confirm("Remettre cet échantillon dans « À prendre » ? Vos collègues pourront le prendre.")) return;
    setSending(true);
    setError("");
    try {
      const answer = await callTake(sampleId, "DELETE");
      if (!answer.ok) {
        setError(answer.error ?? "Impossible de libérer cet échantillon.");
        return;
      }
      startNavigation(() => {
        router.refresh();
        router.push("/technicien");
      });
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={className}>
      <SecondaryButton
        type="button"
        onClick={release}
        disabled={busy}
        aria-busy={busy}
        className={`w-full sm:w-auto ${FOCUS_RING}`}
      >
        <Inbox className="h-4 w-4" aria-hidden="true" />
        {busy ? "Libération…" : "Libérer"}
      </SecondaryButton>
      <ActionError message={error} />
    </div>
  );
}

/**
 * « Reprendre cet échantillon » — a colleague's sample (re-ask 2.13, C3,
 * behind `TAKE_OVER_COLLEAGUE`), after a confirmation that names the
 * holder and says what stays: the readings already saved, each with its
 * author; what they have not saved yet does not. The request names that
 * holder (`holderId`): the server takes it from them only, so a colleague
 * who took it over meanwhile is never the one replaced. Done, the sheet
 * re-renders as mine; refused (it was submitted, released, taken over
 * meanwhile), the reason stays beside the button and the sheet re-renders
 * with the real holder.
 */
export function TakeOverButton({
  sampleId,
  holderId,
  holderName,
  className = "",
}: {
  sampleId: string;
  holderId: string;
  holderName: string;
  className?: string;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [error, setError] = useState("");
  const busy = sending || navigating;

  async function takeOver() {
    if (busy) return;
    if (!window.confirm(takeOverConfirmation(holderName))) return;
    setSending(true);
    setError("");
    try {
      const answer = await callTake(sampleId, "PATCH", { holderId });
      if (!answer.ok) {
        setError(answer.error ?? "Impossible de reprendre cet échantillon.");
        if (isStale(answer.status)) startNavigation(() => router.refresh());
        return;
      }
      startNavigation(() => router.refresh());
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={className}>
      <SecondaryButton
        type="button"
        onClick={takeOver}
        disabled={busy}
        aria-busy={busy}
        className={`w-full sm:w-auto ${FOCUS_RING}`}
      >
        <UserRoundCog className="h-4 w-4" aria-hidden="true" />
        {busy ? "Reprise…" : "Reprendre cet échantillon"}
      </SecondaryButton>
      <ActionError message={error} />
    </div>
  );
}
