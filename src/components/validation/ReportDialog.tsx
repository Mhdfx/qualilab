"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { FOCUSABLE, focusTrapTarget } from "./report-dialog-logic";

/**
 * The modal of the report actions (versions, reopen, resend, conclusion):
 * Escape and the cross close it, focus moves into it on open, Tab and
 * Shift+Tab stay inside it (aria-modal: the page behind is out of the
 * keyboard's reach too — `focusTrapTarget`), and focus returns to the
 * control that opened it on close. The cross is a 44 px target.
 */
export function ReportDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      // Rendered ones only: a control hidden by its state is not in the way.
      const focusables = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.getClientRects().length > 0
      );
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const target = focusTrapTarget(focusables, active, active !== null && panel.current.contains(active), event.shiftKey);
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => opener?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div
        ref={panel}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-left shadow-2xl focus:outline-none"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-2.5 -mt-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
