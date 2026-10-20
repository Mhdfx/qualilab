import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** The closed select's two looks: a grid's cell, a form's field (`.input-field`). */
const BOX: Record<WrappingSelectProps["variant"], string> = {
  cell: "rounded-md border border-slate-300 bg-white py-1.5 pl-2 pr-7 text-sm text-slate-900 shadow-sm peer-focus:border-brand peer-focus:ring-2 peer-focus:ring-brand/20 peer-disabled:bg-slate-50",
  field:
    "rounded-xl border border-slate-200 bg-white py-3.5 pl-3 pr-9 text-sm text-slate-800 transition peer-hover:border-slate-300 peer-focus:border-brand/40 peer-focus:ring-[3px] peer-focus:ring-brand/10 peer-disabled:bg-slate-50",
};

const CHEVRON: Record<WrappingSelectProps["variant"], string> = { cell: "right-2", field: "right-3" };

type WrappingSelectProps = Omit<ComponentPropsWithoutRef<"select">, "className"> & {
  /** The chosen option as the closed select shows it — wrapped onto several lines, never cut. */
  display: ReactNode;
  variant: "cell" | "field";
  /** The wrapper's classes (margins); the box takes the width it is given. */
  className?: string;
};

/**
 * A select whose chosen text wraps instead of being cut (RETOUR-LABO-19-10.md
 * D-18: « Microbiologie des alim… », « Clostridium pe… », « NM ISO 1664… »
 * at 1366 px — a native select never wraps). The native select stays the
 * control — its label, focus, keyboard, the list it opens, what a screen
 * reader reads — laid transparent over a box that shows the chosen option;
 * the box takes the select's look and follows its hover, focus and disabled
 * state. The caller hands `display` from the same value as the select.
 */
export function WrappingSelect({ display, variant, className = "", children, ...select }: WrappingSelectProps) {
  return (
    <div className={`relative ${className}`}>
      <select {...select} className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed">
        {children}
      </select>
      <div aria-hidden="true" className={`${BOX[variant]} break-words`}>
        {display}
      </div>
      <ChevronDown
        className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 ${CHEVRON[variant]}`}
        aria-hidden="true"
      />
    </div>
  );
}
