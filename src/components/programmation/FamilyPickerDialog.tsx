"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Package, Search, X } from "lucide-react";
import { criteriaCountLabel } from "@/lib/family-list";
import { fmt } from "@/lib/interpretation";
import {
  familyFilterFor,
  familyParameterRows,
  filterFamilies,
  typeOf,
  type ProgrammeDraft,
} from "./programme-sheet-logic";
import type { CriterionRef, ProductTypeRef, ProgrammeReferentialData } from "./programme-sheet-types";

/**
 * « Choisir une famille de produits » (16/10, Q124 — RETOUR-LABO-16-10.md
 * F5): the programme sheet's family picker, in place of the select that
 * listed the whole catalogue to every sample. The « Type d'analyse » filter
 * (the laboratory's word for the families, Q124 — the sheet's « Nature
 * d'analyse ») opens on the nature on screen — a food one also lists the
 * families still « à préciser » — and « Tous » shows everything (the route
 * accepts any family of the catalogue or of the client); the search forgives
 * accents and a typo; the client's own families come first, each with its
 * number of germs with a criterion — the count « Familles & critères » shows
 * (D-17, `criteriaCountLabel`).
 *
 * Highlighting a family previews its « Paramètres à rechercher » (F6) and
 * never touches the draft: only « Choisir » hands the choice to the sheet,
 * which replaces the previous family's germs (`applyProductType`). « Fermer »,
 * Échap or the backdrop change nothing.
 *
 * Keyboard: the search has the focus (from 640 px; on a phone the title has
 * it, so the soft keyboard does not cover the list); Tab reaches the list
 * (one stop, arrows move the highlight), « Fermer » and « Choisir », Shift+Tab
 * the « Type d'analyse » filter, and the focus stays inside the dialog.
 * Entrée in the search highlights the first family found and moves the focus
 * to it; Entrée on a family or on « Choisir » chooses; Échap closes without
 * changing anything; the focus returns to the opener on close.
 */

type FamilyPickerDialogProps = {
  referential: ProgrammeReferentialData;
  /** The sheet's draft, read only: its nature presets the filter, its family is the current one. */
  draft: ProgrammeDraft;
  /** Hands the chosen family to the sheet; "" = « Aucune famille ». */
  onChoose: (typeId: string) => void;
  onClose: () => void;
};

/** What Tab may reach inside the dialog (the focus trap). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The « Tous » option of the filter (a nature id is never empty). */
const ALL = "";

/** m and M in the laboratory's notation, « Absence » for an absence test — as the sheet shows them. */
function limits(criterion: CriterionRef): { m: string; bigM: string } {
  if (criterion.mKind === "ABSENCE") return { m: "Absence", bigM: "—" };
  return {
    m: criterion.mKind === "VALUE" && criterion.m !== null ? fmt(criterion.m) : "—",
    bigM: criterion.bigM !== null ? fmt(criterion.bigM) : "—",
  };
}

export function FamilyPickerDialog({ referential, draft, onChoose, onClose }: FamilyPickerDialogProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const introId = `${id}-intro`;
  const formId = `${id}-form`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLFieldSetElement>(null);
  // Read by the keyboard handler, which is set up once (a new callback from the sheet must not re-run it).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Opens on the nature on screen (Q124), changeable; « Tous » = ALL.
  const [natureChoice, setNatureChoice] = useState<string>(draft.natureId);
  const [query, setQuery] = useState("");
  // The family previewed: the current one at first; "" = « Aucune famille ».
  const [highlighted, setHighlighted] = useState<string>(draft.productTypeId);

  const current = typeOf(referential, draft.productTypeId || null);
  const filter = useMemo(
    () => familyFilterFor(natureChoice === ALL ? null : natureChoice, referential, query),
    [natureChoice, referential, query]
  );
  const listed = useMemo(() => filterFamilies(referential.productTypes, filter), [referential.productTypes, filter]);
  // The current family stays at hand, even outside the filter.
  const pinned = current && !listed.some((type) => type.id === current.id) ? current : null;
  const clientFamilies = listed.filter((type) => type.clientId !== null);
  const catalogueFamilies = listed.filter((type) => type.clientId === null);
  const unclassified = filter.includeUnclassified ? listed.filter((type) => type.natureId === null).length : 0;

  // How many families each type d'analyse holds, for the filter's options.
  const counts = useMemo(() => {
    const byNature = new Map<string, number>();
    for (const type of referential.productTypes) {
      if (type.natureId) byNature.set(type.natureId, (byNature.get(type.natureId) ?? 0) + 1);
    }
    return byNature;
  }, [referential.productTypes]);
  const natureLabel = (natureId: string | null) =>
    natureId === null
      ? "type d'analyse à préciser"
      : (referential.familyNatures.find((nature) => nature.id === natureId)?.label ?? null);

  // A highlight the filter hid is no choice: « Choisir » waits for a visible one.
  const visible = highlighted === "" || highlighted === pinned?.id || listed.some((type) => type.id === highlighted);
  const chosen = visible ? highlighted : null;
  const preview = chosen ? typeOf(referential, chosen) : undefined;
  const rows = useMemo(
    () => (preview ? familyParameterRows({ ...draft, productTypeId: preview.id }, referential) : []),
    [draft, preview, referential]
  );

  // The page behind does not scroll; Échap closes; Tab stays inside
  // (aria-modal); the focus goes back where it came from.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // On a phone the soft keyboard would cover the list: the title takes the focus there.
    if (window.matchMedia("(min-width: 640px)").matches) searchRef.current?.focus();
    else titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      // Rendered ones only, and one stop for the list (the checked radio, else the first).
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.getClientRects().length > 0
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && dialogRef.current.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (chosen === null) return;
    onChoose(chosen);
  }

  /**
   * Entrée in the search is « take me to what I typed », never « choose »: it
   * highlights the first family found (the client's first) and moves the
   * focus to it — a second Entrée chooses it.
   */
  function searchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const first = clientFamilies[0] ?? catalogueFamilies[0];
    if (!first) return;
    setHighlighted(first.id);
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLInputElement>(`input[type="radio"][value="${CSS.escape(first.id)}"]`)?.focus();
    });
  }

  const radioName = `${id}-family`;
  const option = (type: ProductTypeRef) => {
    const isCurrent = type.id === draft.productTypeId;
    const nature = natureChoice === ALL || type.natureId === null ? natureLabel(type.natureId) : null;
    return (
      <li key={type.id}>
        <label
          onDoubleClick={() => onChoose(type.id)}
          className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm transition has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand ${
            chosen === type.id ? "border-brand/40 bg-brand-light/60 ring-1 ring-brand/10" : "border-transparent hover:bg-slate-50"
          }`}
        >
          <input
            type="radio"
            name={radioName}
            value={type.id}
            checked={chosen === type.id}
            onChange={() => setHighlighted(type.id)}
            className="accent-brand mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-slate-800">
              {type.name}
              {isCurrent && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  actuelle
                </span>
              )}
            </span>
            <span className="block text-xs text-slate-500">
              {criteriaCountLabel(type.criteriaCount)}
              {nature ? ` · ${nature}` : ""}
            </span>
          </span>
        </label>
      </li>
    );
  };

  // Each heading names its group, so a screen reader moving through the radios hears it.
  const group = (key: string, label: string, types: ProductTypeRef[]) =>
    types.length > 0 && (
      <li role="group" aria-labelledby={`${id}-group-${key}`}>
        <p id={`${id}-group-${key}`} className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <ul className="space-y-0.5">{types.map(option)}</ul>
      </li>
    );

  const resultLine =
    listed.length === 0
      ? "Aucune famille ne correspond."
      : `${listed.length} famille${listed.length > 1 ? "s" : ""}${
          unclassified > 0 ? `, dont ${unclassified} au type d'analyse à préciser` : ""
        }.`;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={introId}
        className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-5xl sm:rounded-2xl lg:h-[85vh]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-1.5 pl-4 pr-2 sm:pl-5">
          <h2 ref={titleRef} id={titleId} tabIndex={-1} className="flex items-center gap-2 text-base font-semibold text-slate-900 focus:outline-none">
            <Package className="h-4 w-4 text-brand" aria-hidden="true" />
            Choisir une famille de produits
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form id={formId} onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
          <div className="space-y-3 border-b border-slate-100 px-4 py-3 sm:px-5">
            <p id={introId} className="text-sm text-slate-600">
              Le filtre part de la nature d&apos;analyse de l&apos;échantillon (son type d&apos;analyse) ; « Tous les types
              d&apos;analyse » montre tout le catalogue. Une famille sélectionnée s&apos;affiche sans rien changer à la fiche :
              « Choisir » remplace les paramètres de la famille actuelle.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-nature`} className="block text-sm font-medium text-slate-700">
                  Type d&apos;analyse
                </label>
                <select
                  id={`${id}-nature`}
                  value={natureChoice}
                  onChange={(event) => setNatureChoice(event.target.value)}
                  className="input-field mt-1.5 px-3"
                >
                  <option value={ALL}>{`Tous les types d'analyse (${referential.productTypes.length})`}</option>
                  {referential.familyNatures.map((nature) => (
                    <option key={nature.id} value={nature.id}>
                      {`${nature.label} (${counts.get(nature.id) ?? 0})${nature.id === draft.natureId ? " — nature de l'échantillon" : ""}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-search`} className="block text-sm font-medium text-slate-700">
                  Rechercher une famille
                </label>
                <div className="relative mt-1.5">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    ref={searchRef}
                    id={`${id}-search`}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={searchKeyDown}
                    aria-describedby={`${id}-result`}
                    placeholder="Ex. : salade, charcuterie, volaille"
                    autoComplete="off"
                    className="input-field pl-9 pr-4"
                  />
                </div>
              </div>
            </div>
            <p id={`${id}-result`} className="text-xs text-slate-500" aria-live="polite">
              {resultLine}
              {listed.length === 0 && natureChoice !== ALL ? " Essayez « Tous les types d'analyse »." : ""}
            </p>
          </div>

          {/* Side by side from lg, each column scrolling; stacked below — on a phone the form is the only scroller, from 640 px the list is capped so the preview stays in reach. */}
          <div className="grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-[minmax(0,1fr)]">
            <fieldset
              ref={listRef}
              className="border-b border-slate-100 px-2 py-2 sm:max-h-[45vh] sm:overflow-y-auto sm:px-3 lg:max-h-none lg:min-h-0 lg:border-b-0 lg:border-r"
            >
              <legend className="sr-only">Familles de produits</legend>
              <ul className="space-y-0.5">
                <li>
                  <label
                    onDoubleClick={() => onChoose("")}
                    className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-sm transition has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand ${
                      chosen === "" ? "border-brand/40 bg-brand-light/60 ring-1 ring-brand/10" : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={radioName}
                      value=""
                      checked={chosen === ""}
                      onChange={() => setHighlighted("")}
                      className="accent-brand mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-800">
                        Aucune famille
                        {draft.productTypeId === "" && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            actuelle
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-slate-500">lecture en valeur simple, sans critère</span>
                    </span>
                  </label>
                </li>
                {pinned && group("pinned", "Famille actuelle (hors filtre)", [pinned])}
                {group("client", "Familles du client", clientFamilies)}
                {group("catalogue", "Catalogue commun", catalogueFamilies)}
              </ul>
            </fieldset>

            <section aria-label="Aperçu de la famille" className="px-4 py-3 sm:px-5 lg:min-h-0 lg:overflow-y-auto">
              {chosen === null ? (
                <p className="text-sm text-slate-500">Sélectionnez une famille pour voir ses paramètres.</p>
              ) : !preview ? (
                <p className="text-sm text-slate-600">
                  Sans famille, chaque analyse est lue en valeur simple, sans critère d&apos;interprétation.
                  {current ? ` Les paramètres de « ${current.name} » seront retirés, sauf ceux cochés à la main ou demandés par le préleveur.` : ""}
                </p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-800">{preview.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {preview.clientId ? "Famille du client" : "Catalogue commun"} · {natureLabel(preview.natureId) ?? "type d'analyse inconnu"} ·{" "}
                    {criteriaCountLabel(preview.criteriaCount)}
                  </p>
                  {rows.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">Aucun critère enregistré : lecture en valeur simple.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[480px] text-sm">
                        <caption className="sr-only">Paramètres à rechercher de « {preview.name} »</caption>
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th scope="col" className="pb-2 pr-3 font-medium">Germe</th>
                            <th scope="col" className="pb-2 pr-3 font-medium">Norme</th>
                            <th scope="col" className="pb-2 pr-3 font-medium">Unité</th>
                            <th scope="col" className="pb-2 pr-3 text-right font-medium normal-case">n</th>
                            <th scope="col" className="pb-2 pr-3 text-right font-medium normal-case">c</th>
                            <th scope="col" className="pb-2 pr-3 text-right font-medium normal-case">m</th>
                            <th scope="col" className="pb-2 text-right font-medium normal-case">M</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const cells = limits(row.criterion);
                            return (
                              <tr key={row.parameterId} className="border-b border-slate-100">
                                <td className="py-2 pr-3 font-medium text-slate-800">
                                  {row.name}
                                  {!row.available && (
                                    <span className="block text-xs font-normal text-slate-500">pas proposé pour cette nature</span>
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-xs text-slate-500">{row.normLabel ?? "—"}</td>
                                <td className="py-2 pr-3 text-xs text-slate-600">{row.unit ?? "—"}</td>
                                <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{row.criterion.n}</td>
                                <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{row.criterion.c ?? "—"}</td>
                                <td className="py-2 pr-3 text-right font-mono text-slate-700">{cells.m}</td>
                                <td className="py-2 text-right font-mono text-slate-700">{cells.bigM}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </form>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Fermer
          </button>
          <button
            type="submit"
            form={formId}
            disabled={chosen === null}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {chosen === "" ? "Choisir « Aucune famille »" : "Choisir cette famille"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
