"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  History,
  PackagePlus,
  Pencil,
  Scale,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EXPIRY_STATE_LABELS, stockTotals, type ItemExpiry, type MovementType } from "@/lib/stock";
import { formatCurrency, formatDecimal } from "@/lib/labels";
import { formatDateOnly, parseIsoDay } from "@/lib/date-only";
import { MOVEMENT_TYPE_LABELS } from "@/lib/stock-journal";

/**
 * The stock screen: articles, their levels, and the movements that are the
 * only way a level changes — so the history always explains the number.
 * Lot 3D (RETOUR-LABO-28-10.md M1, M4, M5): the place of each article, the
 * movement's day and the level after it, an entry's unit price HT, the
 * expiry of the units presumed on the shelf, the last price and the
 * stock's value; the history pages through every movement.
 */

export type StockItemRow = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  location: string | null;
  quantity: number;
  minQuantity: number;
  low: boolean;
  archived: boolean;
  expiry: ItemExpiry | null;
  lastUnitPrice: number | null;
  value: number | null;
};

type Movement = {
  id: string;
  type: MovementType;
  quantity: number;
  lot: string | null;
  expiryDate: string | null;
  note: string | null;
  day: string;
  levelAfter: number | null;
  unitPriceHT: number | null;
  createdBy: { name: string } | null;
};

const inputClass = "input-field px-3 text-sm" as const;
const day = (iso: string) => formatDateOnly(parseIsoDay(iso.slice(0, 10)) ?? new Date(iso));

export function StockManager({
  initialItems,
  locations,
  today,
  expiryWarningDays,
}: {
  initialItems: StockItemRow[];
  /** The places already used: the suggestions of « Lieu de stockage ». */
  locations: string[];
  /** The lab's today « AAAA-MM-JJ »: a movement's default day and its latest. */
  today: string;
  expiryWarningDays: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const response = await fetch("/api/stock/items");
    if (response.ok) setItems(await response.json());
  }, []);

  const totals = stockTotals(items);
  const expiring = items.filter((item) => item.expiry).length;

  return (
    <div>
      <datalist id="stock-locations">
        {locations.map((location) => (
          <option key={location} value={location} />
        ))}
      </datalist>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {items.length} article{items.length > 1 ? "s" : ""} · {items.filter((item) => item.low).length} sous le seuil ·{" "}
          {expiring} à surveiller (péremption, {expiryWarningDays} j) · valeur{" "}
          <span className="font-semibold text-slate-700">{formatCurrency(totals.value)}</span> HT
          {totals.unpriced > 0 && ` (${totals.unpriced} sans prix)`}
        </p>
        <button
          type="button"
          onClick={() => setCreating((current) => !current)}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <PackagePlus className="h-4 w-4" aria-hidden="true" />
          {creating ? "Fermer" : "Nouvel article"}
        </button>
      </div>

      {creating && (
        <ItemForm
          onDone={() => {
            setCreating(false);
            reload();
          }}
          onError={setError}
        />
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          Aucun article — créez le premier, ou importez votre fiche de stock (Import des listes).
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <ItemRow item={item} today={today} onChanged={reload} onError={setError} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemForm({
  item,
  onDone,
  onError,
}: {
  item?: StockItemRow;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [location, setLocation] = useState(item?.location ?? "");
  const [minQuantity, setMinQuantity] = useState(
    item && item.minQuantity > 0 ? String(item.minQuantity) : ""
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch(
        item ? `/api/stock/items/${item.id}` : "/api/stock/items",
        {
          method: item ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, category, unit, minQuantity, location }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Enregistrement impossible.");
        return;
      }
      onDone();
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 border-l-4 border-brand p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Article</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="Gélose PCA" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Catégorie</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="Milieux de culture" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Unité</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="boîte" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Seuil d&apos;alerte</span>
          <input value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} inputMode="decimal" className={`mt-1 ${inputClass}`} placeholder="Vide = aucun" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Lieu de stockage</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} list="stock-locations" className={`mt-1 ${inputClass}`} placeholder="Réfrigérateur 2" />
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 inline-flex min-h-[40px] items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
      >
        {saving ? "Enregistrement…" : item ? "Enregistrer" : "Créer l'article"}
      </button>
    </Card>
  );
}

function ItemRow({
  item,
  today,
  onChanged,
  onError,
}: {
  item: StockItemRow;
  today: string;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [panel, setPanel] = useState<"none" | "move" | "edit" | "history">("none");
  const expired = item.expiry?.state === "PERIME";

  return (
    <Card className={`p-4 ${expired ? "border-rose-300 bg-rose-50/30" : item.low || item.expiry ? "border-amber-300 bg-amber-50/40" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
            {item.name}
            {item.low && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                sous le seuil
              </span>
            )}
            {item.expiry && (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                  expired ? "bg-rose-100 text-rose-800 ring-rose-200" : "bg-amber-100 text-amber-800 ring-amber-200"
                }`}
              >
                {EXPIRY_STATE_LABELS[item.expiry.state].toLowerCase()} · {day(item.expiry.expiryDay)}
                {item.expiry.lot ? ` · lot ${item.expiry.lot}` : ""}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {item.category ?? "Sans catégorie"} · seuil{" "}
            {item.minQuantity > 0 ? `${item.minQuantity} ${item.unit}` : "aucun"}
            {item.location && ` · ${item.location}`}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {item.lastUnitPrice !== null
              ? `Dernier prix ${formatCurrency(item.lastUnitPrice)} HT / ${item.unit} · valeur ${formatCurrency(item.value ?? 0)} HT`
              : "Aucun prix d'achat enregistré"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-2 text-lg font-bold tabular-nums text-slate-900">
            {item.quantity}
            <span className="ml-1 text-sm font-medium text-slate-500">{item.unit}</span>
          </p>
          <RowButton
            icon={ClipboardList}
            label="Mouvement"
            active={panel === "move"}
            onClick={() => setPanel(panel === "move" ? "none" : "move")}
          />
          <RowButton
            icon={History}
            label="Historique"
            active={panel === "history"}
            onClick={() => setPanel(panel === "history" ? "none" : "history")}
          />
          <RowButton
            icon={Pencil}
            label="Modifier"
            active={panel === "edit"}
            onClick={() => setPanel(panel === "edit" ? "none" : "edit")}
          />
        </div>
      </div>

      {panel === "move" && (
        <MovementForm
          item={item}
          today={today}
          onDone={() => {
            setPanel("none");
            onChanged();
          }}
          onError={onError}
        />
      )}
      {panel === "edit" && (
        <div className="mt-3">
          <ItemForm
            item={item}
            onDone={() => {
              setPanel("none");
              onChanged();
            }}
            onError={onError}
          />
        </div>
      )}
      {panel === "history" && <MovementHistory itemId={item.id} unit={item.unit} />}
    </Card>
  );
}

function RowButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Pencil;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active
          ? "border-brand bg-brand/5 text-brand"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

function MovementForm({
  item,
  today,
  onDone,
  onError,
}: {
  item: StockItemRow;
  today: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [type, setType] = useState<MovementType>("ENTREE");
  const [movementDate, setMovementDate] = useState(today);
  const [quantity, setQuantity] = useState("");
  const [unitPriceHT, setUnitPriceHT] = useState("");
  const [lot, setLot] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/stock/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          type,
          movementDate,
          quantity,
          unitPriceHT: type === "ENTREE" ? unitPriceHT : "",
          lot,
          expiryDate,
          note,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Mouvement impossible.");
        return;
      }
      onDone();
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const typeIcons: Record<MovementType, typeof Scale> = {
    ENTREE: ArrowDownToLine,
    SORTIE: ArrowUpFromLine,
    AJUSTEMENT: Scale,
  };

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as MovementType)}
            className={`mt-1 ${inputClass} bg-white`}
          >
            {(Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[]).map((key) => (
              <option key={key} value={key}>
                {MOVEMENT_TYPE_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Date du mouvement</span>
          <input type="date" value={movementDate} max={today} onChange={(e) => setMovementDate(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">
            {type === "AJUSTEMENT" ? "Quantité comptée" : "Quantité"} ({item.unit})
          </span>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" className={`mt-1 ${inputClass}`} placeholder="0" />
        </label>
        {type === "ENTREE" && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Prix unitaire HT (facultatif)</span>
            <input value={unitPriceHT} onChange={(e) => setUnitPriceHT(e.target.value)} inputMode="decimal" className={`mt-1 ${inputClass}`} placeholder={item.lastUnitPrice !== null ? formatDecimal(item.lastUnitPrice, 2) : "DH"} />
          </label>
        )}
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Lot (facultatif)</span>
          <input value={lot} onChange={(e) => setLot(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Péremption (facultatif)</span>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="Facultatif" />
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
      >
        {(() => {
          const Icon = typeIcons[type];
          return <Icon className="h-4 w-4" aria-hidden="true" />;
        })()}
        {saving ? "Enregistrement…" : "Enregistrer le mouvement"}
      </button>
    </div>
  );
}

function MovementHistory({ itemId, unit }: { itemId: string; unit: string }) {
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stock/movements?itemId=${encodeURIComponent(itemId)}&paged=1`)
      .then((response) => (response.ok ? response.json() : { items: [], nextCursor: null }))
      .then((data) => {
        if (cancelled) return;
        setMovements(data.items);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {
        if (!cancelled) setMovements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  async function more() {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/stock/movements?itemId=${encodeURIComponent(itemId)}&paged=1&cursor=${encodeURIComponent(nextCursor)}`);
      if (response.ok) {
        const data = await response.json();
        setMovements((current) => [...(current ?? []), ...data.items]);
        setNextCursor(data.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  }

  if (movements === null) {
    return <p className="mt-3 text-sm text-slate-500">Chargement de l&apos;historique…</p>;
  }
  if (movements.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">Aucun mouvement enregistré.</p>;
  }

  return (
    <div className="mt-3">
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {movements.map((movement) => (
          <li key={movement.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-sm">
            <span
              className={`font-medium ${
                movement.type === "ENTREE"
                  ? "text-emerald-700"
                  : movement.type === "SORTIE"
                    ? "text-rose-700"
                    : "text-slate-700"
              }`}
            >
              {MOVEMENT_TYPE_LABELS[movement.type]} · {movement.quantity}
              {movement.levelAfter !== null && (
                <span className="font-normal text-slate-500"> → stock {movement.levelAfter} {unit}</span>
              )}
            </span>
            <span className="text-xs text-slate-500">
              {day(movement.day)}
              {movement.lot && ` · lot ${movement.lot}`}
              {movement.expiryDate && ` · péremption ${day(movement.expiryDate)}`}
              {movement.unitPriceHT !== null && ` · ${formatCurrency(movement.unitPriceHT)} HT / ${unit}`}
              {movement.createdBy && ` · ${movement.createdBy.name}`}
              {movement.note && ` · ${movement.note}`}
            </span>
          </li>
        ))}
      </ul>
      {nextCursor && (
        <button
          type="button"
          onClick={more}
          disabled={loading}
          className="mt-2 inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          {loading ? "Chargement…" : "Mouvements plus anciens"}
        </button>
      )}
    </div>
  );
}
