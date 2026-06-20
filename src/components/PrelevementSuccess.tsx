"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Check, Printer } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { PrimaryButton, SecondaryButton } from "./PrimaryButton";
import { SampleStatusTimeline } from "./SampleStatusTimeline";
import { SAMPLE_TYPE_LABELS, formatDateTime } from "@/lib/labels";
import type { SampleType } from "@/generated/prisma/client";

type PrelevementSuccessProps = {
  code: string;
  clientName: string;
  lieu: string;
  type: SampleType;
  sampledAt: string;
  onDone: () => void;
};

export function PrelevementSuccess({
  code,
  clientName,
  lieu,
  type,
  sampledAt,
  onDone,
}: PrelevementSuccessProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-center shadow-lg print:hidden">
        <div className="bg-gradient-to-br from-brand via-[#234b73] to-brand-accent px-6 py-8 text-white sm:px-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/20 backdrop-blur-sm">
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold">Prélèvement enregistré</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/75">
            Le code unique est synchronisé avec le tableau de bord administrateur.
          </p>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mx-auto max-w-sm rounded-2xl border-2 border-brand/15 bg-gradient-to-b from-brand-light/60 to-white px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Code échantillon
            </p>
            <p className="mt-2 font-mono text-3xl font-bold tracking-wide text-brand sm:text-4xl">
              {code}
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-brand/20 bg-white px-5 py-2 text-sm font-semibold text-brand shadow-sm transition hover:bg-brand-light/50"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copié !
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copier le code
                </>
              )}
            </button>
          </div>

          <div className="mx-auto mt-6 max-w-lg text-left">
            <SampleStatusTimeline status="PRELEVE" />
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <SecondaryButton type="button" onClick={handlePrint} className="px-6 py-3">
              <Printer className="h-4 w-4" />
              Imprimer l&apos;étiquette
            </SecondaryButton>
            <PrimaryButton type="button" onClick={onDone} className="px-8 py-3">
              Retour au tableau de bord
            </PrimaryButton>
          </div>
        </div>
      </div>

      <div id="print-label" className="hidden print:block print:p-8">
        <div className="mx-auto max-w-md rounded-lg border-2 border-brand p-6">
          <BrandLogo className="mb-4" />
          <div className="border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold uppercase text-slate-500">
              Qualilab International — Étiquette prélèvement
            </p>
            <p className="mt-4 font-mono text-4xl font-bold text-brand">{code}</p>
            <dl className="mt-6 space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Client</dt>
                <dd className="font-medium text-slate-900">{clientName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Lieu</dt>
                <dd className="text-slate-900">{lieu}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Type</dt>
                <dd className="text-slate-900">{SAMPLE_TYPE_LABELS[type]}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Date de prélèvement</dt>
                <dd className="text-slate-900">{formatDateTime(sampledAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Statut</dt>
                <dd className="font-semibold text-brand">Prélevé</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
