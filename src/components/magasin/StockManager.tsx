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
import type { MovementType } from "@/lib/stock";

/**
 * The stock screen: articles, their levels, and the movements that are the
 * only way a level changes — so the history always explains the number.
 */

export type StockItemRow = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  quantity: number;
  minQuantity: number;
  low: boolean;
  archived: boolean;
};

type Movement = {
  id: string;
  type: MovementType;
  quantity: number;
  lot: string | null;
  expiryDate: string | null;
  note: string | null;
  createdAt: string;
  createdBy: { name: string } | null;
};

const TYPE_LABELS: Record<MovementType, string> = {
  ENTREE: "Entrée",
  SORTIE: "Sortie",
  AJUSTEMENT: "Ajustement (inventaire)",
};

const inputClass =
  "input-field px-3 text-sm" as const;

export function StockManager({ initialItems }: { initialItems: StockItemRow[] }) {
  const [items, setItems] = useState(initialItems);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const response = await fetch("/api/stock/items");
    if (response.ok) setItems(await response.json());
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {items.length} article{items.length > 1 ? "s" : ""} ·{" "}
          {items.filter((item) => item.low).length} sous le seuil
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
          Aucun article — créez le premier pour commencer le suivi du stock.
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <ItemRow item={item} onChanged={reload} onError={setError} />
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
          body: JSON.stringify({ name, category, unit, minQuantity }),
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
  onChanged,
  onError,
}: {
  item: StockItemRow;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [panel, setPanel] = useState<"none" | "move" | "edit" | "history">("none");

  return (
    <Card className={`p-4 ${item.low ? "border-amber-300 bg-amber-50/40" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
            {item.name}
            {item.low && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                sous le seuil
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {item.category ?? "Sans catégorie"} · seuil{" "}
            {item.minQuantity > 0 ? `${item.minQuantity} ${item.unit}` : "aucun"}
          </p>
        </div>

        <div className="flex items-center gap-2">
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
      {panel === "history" && <MovementHistory itemId={item.id} />}
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
  onDone,
  onError,
}: {
  item: StockItemRow;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [type, setType] = useState<MovementType>("ENTREE");
  const [quantity, setQuantity] = useState("");
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
        body: JSON.stringify({ itemId: item.id, type, quantity, lot, expiryDate, note }),
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as MovementType)}
            className={`mt-1 ${inputClass} bg-white`}
          >
            {(Object.keys(TYPE_LABELS) as MovementType[]).map((key) => (
              <option key={key} value={key}>
                {TYPE_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">
            {type === "AJUSTEMENT" ? "Quantité comptée" : "Quantité"} ({item.unit})
          </span>
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" className={`mt-1 ${inputClass}`} placeholder="0" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Lot (facultatif)</span>
          <input value={lot} onChange={(e) => setLot(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Péremption (facultatif)</span>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
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

function MovementHistory({ itemId }: { itemId: string }) {
  const [movements, setMovements] = useState<Movement[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stock/movements?itemId=${itemId}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (!cancelled) setMovements(data);
      })
      .catch(() => {
        if (!cancelled) setMovements([]);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  if (movements === null) {
    return <p className="mt-3 text-sm text-slate-500">Chargement de l&apos;historique…</p>;
  }
  if (movements.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">Aucun mouvement enregistré.</p>;
  }

  return (
    <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
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
            {TYPE_LABELS[movement.type]} · {movement.quantity}
          </span>
          <span className="text-xs text-slate-500">
            {movement.lot && `lot ${movement.lot} · `}
            {new Date(movement.createdAt).toLocaleDateString("fr-FR")}
            {movement.createdBy && ` · ${movement.createdBy.name}`}
            {movement.note && ` · ${movement.note}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
