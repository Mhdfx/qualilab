"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SecondaryButton } from "@/components/PrimaryButton";
import {
  onssaDraftError,
  onssaDraftOf,
  onssaPayload,
  type OnssaControl,
  type OnssaDraft,
} from "@/lib/onssa-control";
import { OnssaControlFields } from "./OnssaControlFields";

/**
 * Lot 3E, N1 — the correction of a stored série's « Contrôle officiel »,
 * sampling body, establishment and origin (PATCH /api/series/[id], the
 * cadre's rule: the préleveur until the reception, the laboratory at any
 * time; journalled before / after). Shown at the reception, before and after
 * the série is received, and on the préleveur's visit.
 */
export function OnssaControlPanel({
  serieId,
  initial,
  locked = false,
  lockedReason,
  validatedSamples = false,
}: {
  serieId: string;
  initial: Partial<OnssaControl>;
  /** Read-only (the préleveur's received série). */
  locked?: boolean;
  lockedReason?: string;
  /**
   * Some samples of the série are validated: their month may already have
   * been exported to the ONSSA. A correction stays allowed (hypothèse, à
   * confirmer par R-22; the journal keeps before and after) — the panel says so.
   */
  validatedSamples?: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<OnssaDraft>(() => onssaDraftOf(initial));
  const [draft, setDraft] = useState<OnssaDraft>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showInvalid, setShowInvalid] = useState(false);

  const dirty = JSON.stringify(onssaPayload(draft)) !== JSON.stringify(onssaPayload(saved));

  async function save() {
    const problem = onssaDraftError(draft);
    if (problem) {
      setShowInvalid(true);
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const response = await fetch(`/api/series/${serieId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(onssaPayload(draft)),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<OnssaControl> & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "L'enregistrement a échoué. Réessayez.");
        return;
      }
      const next = onssaDraftOf(data);
      setSaved(next);
      setDraft(next);
      setShowInvalid(false);
      setDone(true);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <OnssaControlFields
        idPrefix={`onssa-${serieId}`}
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setDone(false);
          if (error) setError(null);
        }}
        invalid={showInvalid}
        disabled={locked || busy}
        compact
      />
      {locked ? (
        lockedReason && <p className="mt-3 text-xs text-slate-500">{lockedReason}</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SecondaryButton type="button" onClick={save} disabled={!dirty || busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </SecondaryButton>
          {done && !dirty && (
            <span role="status" className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Enregistré
            </span>
          )}
        </div>
      )}
      {validatedSamples && !locked && (
        <p className="mt-3 text-xs text-amber-800">
          Des échantillons de cette série sont validés : une correction change les chiffres du rapport ONSSA de leur
          mois, à générer de nouveau s&apos;il a déjà été exporté.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </Card>
  );
}
