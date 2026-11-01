"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Layers, ListChecks, Plus, Tags, Wand2 } from "lucide-react";
import type { Family, OnssaDomain, SampleType } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { FAMILY_SHORT_LABELS, SAMPLE_TYPE_LABELS } from "@/lib/labels";
import {
  ONSSA_COLUMNS,
  ONSSA_DOMAIN_LABELS,
  ONSSA_GROUP_NAME_MAX,
  PROPOSED_ONSSA_GROUPS,
  matchText,
  onssaColumn,
  type OnssaColumnKey,
} from "@/lib/onssa-canevas";
import type { ColumnLink, GroupLink, MappingBatch } from "@/lib/onssa-mapping";

/**
 * Lot 3E, N2 — /admin/onssa: the product groups of the ONSSA report, the
 * group of each type d'analyse and family, the canevas column of each
 * parameter. A choice in a list is saved at once (PATCH
 * /api/admin/onssa/mappings, journalled); the bulk actions — the proposed
 * columns, the families shown without a group — in one save each.
 */

export type OnssaGroupRow = { id: string; name: string; domain: OnssaDomain; sortOrder: number; active: boolean };
/** `active` false: an archived type d'analyse still carrying samples (the report counts them). */
export type OnssaNatureRow = { id: string; label: string; onssaGroupId: string | null; active: boolean };
export type OnssaFamilyRow = {
  id: string;
  name: string;
  natureId: string | null;
  onssaGroupId: string | null;
  /** A client's own product (not the laboratory's catalogue). */
  clientOwn: boolean;
  /** false: an archived family still carrying samples (the report counts them). */
  active: boolean;
};
export type OnssaParameterRow = {
  id: string;
  name: string;
  category: SampleType;
  family: Family;
  onssaColumn: string | null;
  /** The column proposed from the name and the aliases, for a parameter still « non déclaré ». */
  proposal: OnssaColumnKey | null;
};

/** How many families the list shows at once (the filters narrow it). */
const FAMILY_PAGE = 200;
const NONE = "";

const SELECT = "input-field py-2 pl-3 pr-8 text-sm";

async function patchJson(url: string, body: unknown, method: "PATCH" | "POST" = "PATCH") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "L'enregistrement a échoué. Réessayez.");
  return data;
}

export function OnssaMappingsManager({
  groups: initialGroups,
  natures: initialNatures,
  productTypes: initialTypes,
  parameters: initialParameters,
}: {
  groups: OnssaGroupRow[];
  natures: OnssaNatureRow[];
  productTypes: OnssaFamilyRow[];
  parameters: OnssaParameterRow[];
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [natures, setNatures] = useState(initialNatures);
  const [types, setTypes] = useState(initialTypes);
  const [parameters, setParameters] = useState(initialParameters);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const activeGroups = useMemo(
    () => [...groups].filter((g) => g.active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr")),
    [groups]
  );
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "Non déclaré";
  const natureLabel = (id: string | null) => natures.find((n) => n.id === id)?.label ?? "Type d'analyse à préciser";

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ kind: "ok", text: await action() });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Une erreur est survenue." });
    } finally {
      setBusy(false);
    }
  }

  /** Saves correspondences, then applies them on screen. */
  function saveLinks(batch: Partial<MappingBatch>, done: string) {
    return run(async () => {
      await patchJson("/api/admin/onssa/mappings", batch);
      const apply = <T extends { id: string }>(rows: T[], links: (GroupLink | ColumnLink)[] | undefined, key: keyof T) => {
        if (!links?.length) return rows;
        const next = new Map(links.map((link) => [link.id, "groupId" in link ? link.groupId : link.column]));
        return rows.map((row) => (next.has(row.id) ? { ...row, [key]: next.get(row.id) } : row));
      };
      setTypes((rows) => apply(rows, batch.productTypes, "onssaGroupId"));
      setNatures((rows) => apply(rows, batch.natures, "onssaGroupId"));
      setParameters((rows) =>
        apply(rows, batch.parameters, "onssaColumn").map((row) =>
          batch.parameters?.some((link) => link.id === row.id) ? { ...row, proposal: null } : row
        )
      );
      return done;
    });
  }

  // ---- Groups ----------------------------------------------------------------
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState<OnssaDomain>("ALIMENTAIRE");

  function addGroups(body: unknown, done: string) {
    return run(async () => {
      const data = await patchJson("/api/admin/onssa/groups", body, "POST");
      const created = (data.created as OnssaGroupRow[] | undefined) ?? [];
      setGroups((rows) => [...rows, ...created]);
      setNewName("");
      return created.length === 0 ? "Tous les groupes proposés existent déjà." : done;
    });
  }

  function updateGroup(id: string, patch: Partial<Omit<OnssaGroupRow, "id">>, done: string) {
    return run(async () => {
      const group = (await patchJson(`/api/admin/onssa/groups/${id}`, patch)) as unknown as OnssaGroupRow;
      setGroups((rows) => rows.map((row) => (row.id === id ? group : row)));
      return done;
    });
  }

  // ---- Families --------------------------------------------------------------
  const [familyQuery, setFamilyQuery] = useState("");
  const [familyNature, setFamilyNature] = useState<string>("TOUS");
  const [onlyUnmapped, setOnlyUnmapped] = useState(true);
  const [withArchived, setWithArchived] = useState(true);
  const archivedCount = types.filter((type) => !type.active).length;
  const [bulkGroup, setBulkGroup] = useState(NONE);
  const filteredTypes = useMemo(() => {
    const query = matchText(familyQuery);
    return types.filter(
      (type) =>
        (!onlyUnmapped || !type.onssaGroupId) &&
        (withArchived || type.active) &&
        (familyNature === "TOUS" || (familyNature === "AUCUN" ? !type.natureId : type.natureId === familyNature)) &&
        (!query || matchText(type.name).includes(query))
    );
  }, [types, familyQuery, familyNature, onlyUnmapped, withArchived]);
  const shownTypes = filteredTypes.slice(0, FAMILY_PAGE);
  const bulkTargets = filteredTypes.filter((type) => !type.onssaGroupId);

  // ---- Parameters ------------------------------------------------------------
  const [parameterQuery, setParameterQuery] = useState("");
  const [parameterFilter, setParameterFilter] = useState<"TOUS" | "NON_DECLARES" | "PROPOSES">("TOUS");
  const proposals = parameters.filter((p) => p.proposal && !p.onssaColumn);
  const filteredParameters = useMemo(() => {
    const query = matchText(parameterQuery);
    return parameters.filter(
      (p) =>
        (parameterFilter === "TOUS" ||
          (parameterFilter === "NON_DECLARES" ? !p.onssaColumn : Boolean(p.proposal && !p.onssaColumn))) &&
        (!query || matchText(p.name).includes(query))
    );
  }, [parameters, parameterQuery, parameterFilter]);

  const groupOptions = (current: string | null) => {
    const archived = current && !activeGroups.some((g) => g.id === current) ? groups.find((g) => g.id === current) : null;
    return (
      <>
        <option value={NONE}>Non déclaré</option>
        {activeGroups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
        {archived && (
          <option value={archived.id}>
            {archived.name} (archivé)
          </option>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <p aria-live="polite" className="sr-only">
        {message?.text ?? ""}
      </p>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : undefined}
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* ---- Groups ---- */}
      <Card className="p-5">
        <h2 className="section-title">
          <Layers className="h-4 w-4" aria-hidden="true" />
          Groupes de produits
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Les lignes du canevas, une par groupe. La liste du laboratoire est demandée (relance R-22) ; en attendant,
          une liste proposée se crée en un clic, puis se renomme, se réordonne ou s&apos;archive.
        </p>

        {groups.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            <p>Aucun groupe. Liste proposée : {PROPOSED_ONSSA_GROUPS.map((g) => g.name).join(", ")}.</p>
            <PrimaryButton
              type="button"
              className="mt-3"
              disabled={busy}
              onClick={() => addGroups({ proposed: true }, "La liste proposée est créée.")}
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              Créer la liste proposée ({PROPOSED_ONSSA_GROUPS.length} groupes)
            </PrimaryButton>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {[...groups]
              .sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"))
              .map((group) => (
                <GroupRow key={group.id} group={group} busy={busy} onSave={updateGroup} />
              ))}
          </ul>
        )}

        <form
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addGroups({ name: newName, domain: newDomain }, `Groupe « ${newName.trim()} » créé.`);
          }}
        >
          <div className="min-w-[14rem] flex-1">
            <label htmlFor="onssa-new-group" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Nouveau groupe
            </label>
            <input
              id="onssa-new-group"
              type="text"
              value={newName}
              maxLength={ONSSA_GROUP_NAME_MAX}
              onChange={(e) => setNewName(e.target.value)}
              className="input-field px-3 py-2"
              required
            />
          </div>
          <div>
            <label htmlFor="onssa-new-domain" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Domaine
            </label>
            <select
              id="onssa-new-domain"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value as OnssaDomain)}
              className={SELECT}
            >
              {(Object.keys(ONSSA_DOMAIN_LABELS) as OnssaDomain[]).map((domain) => (
                <option key={domain} value={domain}>
                  {ONSSA_DOMAIN_LABELS[domain]}
                </option>
              ))}
            </select>
          </div>
          <SecondaryButton type="submit" disabled={busy || !newName.trim()}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter
          </SecondaryButton>
          {groups.length > 0 && groups.length < PROPOSED_ONSSA_GROUPS.length && (
            <SecondaryButton
              type="button"
              disabled={busy}
              onClick={() => addGroups({ proposed: true }, "Les groupes proposés manquants sont créés.")}
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              Compléter avec la liste proposée
            </SecondaryButton>
          )}
        </form>
      </Card>

      {/* ---- Natures ---- */}
      <Card className="p-5">
        <h2 className="section-title">
          <ListChecks className="h-4 w-4" aria-hidden="true" />
          Types d&apos;analyse
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Le groupe des échantillons dont la famille n&apos;en a pas (les eaux, par exemple). Surfaces, mains et air : non
          déclarés tant que le laboratoire ne demande pas de les compter (R-22).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {natures.map((nature) => (
            <div key={nature.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2">
              <label htmlFor={`onssa-nature-${nature.id}`} className="text-sm font-medium text-slate-800">
                {nature.label}
                {!nature.active && <span className="ml-1 text-xs font-normal text-slate-500">(archivé)</span>}
              </label>
              <select
                id={`onssa-nature-${nature.id}`}
                value={nature.onssaGroupId ?? NONE}
                disabled={busy}
                onChange={(e) =>
                  saveLinks(
                    { natures: [{ id: nature.id, groupId: e.target.value || null }] },
                    `« ${nature.label} » : ${groupName(e.target.value || null)}.`
                  )
                }
                className={`${SELECT} max-w-[14rem]`}
              >
                {groupOptions(nature.onssaGroupId)}
              </select>
            </div>
          ))}
        </div>
      </Card>

      {/* ---- Families ---- */}
      <Card className="p-5">
        <h2 className="section-title">
          <Tags className="h-4 w-4" aria-hidden="true" />
          Familles de produits
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Le groupe d&apos;une famille l&apos;emporte sur celui de son type d&apos;analyse. {types.filter((t) => !t.onssaGroupId).length}{" "}
          famille{types.filter((t) => !t.onssaGroupId).length > 1 ? "s" : ""} sans groupe sur {types.length}.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="onssa-family-query" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Rechercher
            </label>
            <input
              id="onssa-family-query"
              type="search"
              value={familyQuery}
              onChange={(e) => setFamilyQuery(e.target.value)}
              className="input-field px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="onssa-family-nature" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Type d&apos;analyse
            </label>
            <select id="onssa-family-nature" value={familyNature} onChange={(e) => setFamilyNature(e.target.value)} className={SELECT}>
              <option value="TOUS">Tous</option>
              {natures.map((nature) => (
                <option key={nature.id} value={nature.id}>
                  {nature.label}
                </option>
              ))}
              <option value="AUCUN">À préciser</option>
            </select>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={onlyUnmapped}
              onChange={(e) => setOnlyUnmapped(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Sans groupe seulement
          </label>
          {archivedCount > 0 && (
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={withArchived}
                onChange={(e) => setWithArchived(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Familles archivées ({archivedCount})
            </label>
          )}
        </div>
        {archivedCount > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Les familles archivées listées portent encore des échantillons : le rapport les compte, classez-les aussi.
          </p>
        )}

        {bulkTargets.length > 0 && (
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-3">
            <div>
              <label htmlFor="onssa-bulk-group" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Classer les {bulkTargets.length} famille{bulkTargets.length > 1 ? "s" : ""} trouvée
                {bulkTargets.length > 1 ? "s" : ""} sans groupe dans
              </label>
              <select id="onssa-bulk-group" value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)} className={SELECT}>
                <option value={NONE}>Choisir un groupe…</option>
                {activeGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <SecondaryButton
              type="button"
              disabled={busy || !bulkGroup}
              onClick={() =>
                saveLinks(
                  { productTypes: bulkTargets.map((type) => ({ id: type.id, groupId: bulkGroup })) },
                  `${bulkTargets.length} famille${bulkTargets.length > 1 ? "s" : ""} classée${bulkTargets.length > 1 ? "s" : ""} dans « ${groupName(bulkGroup)} ».`
                )
              }
            >
              Classer
            </SecondaryButton>
          </div>
        )}

        {filteredTypes.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Aucune famille ne correspond.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="pb-2 pr-3 font-medium">Famille</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Type d&apos;analyse</th>
                  <th scope="col" className="pb-2 font-medium">Groupe ONSSA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shownTypes.map((type) => (
                  <tr key={type.id}>
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800">
                      <label htmlFor={`onssa-family-${type.id}`}>{type.name}</label>
                      {type.clientOwn && <span className="ml-1 text-xs font-normal text-slate-500">(produit d&apos;un client)</span>}
                      {!type.active && <span className="ml-1 text-xs font-normal text-slate-500">(archivée)</span>}
                    </th>
                    <td className="py-2 pr-3 text-slate-600">{natureLabel(type.natureId)}</td>
                    <td className="py-2">
                      <select
                        id={`onssa-family-${type.id}`}
                        value={type.onssaGroupId ?? NONE}
                        disabled={busy}
                        onChange={(e) =>
                          saveLinks(
                            { productTypes: [{ id: type.id, groupId: e.target.value || null }] },
                            `« ${type.name} » : ${groupName(e.target.value || null)}.`
                          )
                        }
                        className={`${SELECT} max-w-[16rem]`}
                      >
                        {groupOptions(type.onssaGroupId)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTypes.length > FAMILY_PAGE && (
              <p className="mt-2 text-xs text-slate-500">
                {FAMILY_PAGE} familles affichées sur {filteredTypes.length} : affinez la recherche.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ---- Parameters ---- */}
      <Card className="p-5">
        <h2 className="section-title">
          <ListChecks className="h-4 w-4" aria-hidden="true" />
          Paramètres → colonnes du canevas
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Les 23 colonnes microbiologiques de la feuille « II-AT » et « chimie alimentaires ». Pour les levures et les
          moisissures, la méthode du résultat choisit la colonne (NM 08.0.123, NM ISO 21527-1 ou -2).
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="onssa-parameter-query" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Rechercher
            </label>
            <input
              id="onssa-parameter-query"
              type="search"
              value={parameterQuery}
              onChange={(e) => setParameterQuery(e.target.value)}
              className="input-field px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="onssa-parameter-filter" className="mb-1.5 block text-sm font-semibold text-slate-700">
              Afficher
            </label>
            <select
              id="onssa-parameter-filter"
              value={parameterFilter}
              onChange={(e) => setParameterFilter(e.target.value as typeof parameterFilter)}
              className={SELECT}
            >
              <option value="TOUS">Tous</option>
              <option value="NON_DECLARES">Non déclarés</option>
              <option value="PROPOSES">Avec une proposition</option>
            </select>
          </div>
          {proposals.length > 0 && (
            <PrimaryButton
              type="button"
              disabled={busy}
              onClick={() =>
                saveLinks(
                  { parameters: proposals.map((p) => ({ id: p.id, column: p.proposal })) },
                  `${proposals.length} proposition${proposals.length > 1 ? "s" : ""} appliquée${proposals.length > 1 ? "s" : ""}.`
                )
              }
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              Appliquer les {proposals.length} proposition{proposals.length > 1 ? "s" : ""}
            </PrimaryButton>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="pb-2 pr-3 font-medium">Paramètre</th>
                <th scope="col" className="pb-2 pr-3 font-medium">Catégorie</th>
                <th scope="col" className="pb-2 font-medium">Colonne ONSSA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredParameters.map((parameter) => (
                <tr key={parameter.id} className="align-top">
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-800">
                    <label htmlFor={`onssa-parameter-${parameter.id}`}>{parameter.name}</label>
                  </th>
                  <td className="py-2 pr-3 text-slate-600">
                    {SAMPLE_TYPE_LABELS[parameter.category]} · {FAMILY_SHORT_LABELS[parameter.family]}
                  </td>
                  <td className="py-2">
                    <select
                      id={`onssa-parameter-${parameter.id}`}
                      value={parameter.onssaColumn ?? NONE}
                      disabled={busy}
                      onChange={(e) =>
                        saveLinks(
                          { parameters: [{ id: parameter.id, column: (e.target.value || null) as OnssaColumnKey | null }] },
                          `« ${parameter.name} » : ${onssaColumn(e.target.value)?.label ?? "non déclaré"}.`
                        )
                      }
                      className={`${SELECT} max-w-[20rem]`}
                    >
                      <option value={NONE}>Non déclaré</option>
                      {ONSSA_COLUMNS.map((column) => (
                        <option key={column.key} value={column.key}>
                          {column.label}
                        </option>
                      ))}
                    </select>
                    {parameter.proposal && !parameter.onssaColumn && (
                      <p className="mt-1 text-xs text-slate-500">
                        Proposé : {onssaColumn(parameter.proposal)?.label}{" "}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            saveLinks(
                              { parameters: [{ id: parameter.id, column: parameter.proposal }] },
                              `« ${parameter.name} » : ${onssaColumn(parameter.proposal)?.label}.`
                            )
                          }
                          className="font-semibold text-brand hover:underline disabled:opacity-60"
                        >
                          Appliquer
                        </button>
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredParameters.length === 0 && <p className="mt-3 text-sm text-slate-500">Aucun paramètre ne correspond.</p>}
        </div>
      </Card>
    </div>
  );
}

function GroupRow({
  group,
  busy,
  onSave,
}: {
  group: OnssaGroupRow;
  busy: boolean;
  onSave: (id: string, patch: Partial<Omit<OnssaGroupRow, "id">>, done: string) => Promise<void>;
}) {
  const [name, setName] = useState(group.name);
  const [domain, setDomain] = useState(group.domain);
  const [order, setOrder] = useState(String(group.sortOrder));
  const parsedOrder = Number(order);
  const dirty = name.trim() !== group.name || domain !== group.domain || parsedOrder !== group.sortOrder;
  const orderValid = order.trim() !== "" && Number.isInteger(parsedOrder) && parsedOrder >= 0 && parsedOrder <= 999;

  return (
    <li className={`flex flex-wrap items-end gap-3 py-3 ${group.active ? "" : "opacity-70"}`}>
      <div className="min-w-[12rem] flex-1">
        <label htmlFor={`onssa-group-${group.id}`} className="mb-1 block text-xs font-medium text-slate-500">
          Nom{group.active ? "" : " (archivé)"}
        </label>
        <input
          id={`onssa-group-${group.id}`}
          type="text"
          value={name}
          maxLength={ONSSA_GROUP_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          className="input-field px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor={`onssa-group-domain-${group.id}`} className="mb-1 block text-xs font-medium text-slate-500">
          Domaine
        </label>
        <select
          id={`onssa-group-domain-${group.id}`}
          value={domain}
          onChange={(e) => setDomain(e.target.value as OnssaDomain)}
          className={SELECT}
        >
          {(Object.keys(ONSSA_DOMAIN_LABELS) as OnssaDomain[]).map((d) => (
            <option key={d} value={d}>
              {ONSSA_DOMAIN_LABELS[d]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`onssa-group-order-${group.id}`} className="mb-1 block text-xs font-medium text-slate-500">
          Ordre
        </label>
        <input
          id={`onssa-group-order-${group.id}`}
          type="number"
          min={0}
          max={999}
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          className="input-field w-24 px-3 py-2"
        />
      </div>
      <SecondaryButton
        type="button"
        disabled={busy || !dirty || !name.trim() || !orderValid}
        onClick={() =>
          onSave(group.id, { name: name.trim(), domain, sortOrder: parsedOrder }, `Groupe « ${name.trim()} » enregistré.`)
        }
      >
        Enregistrer
      </SecondaryButton>
      <SecondaryButton
        type="button"
        disabled={busy}
        onClick={() =>
          onSave(
            group.id,
            { active: !group.active },
            group.active ? `Groupe « ${group.name} » archivé.` : `Groupe « ${group.name} » rétabli.`
          )
        }
      >
        {group.active ? <Archive className="h-4 w-4" aria-hidden="true" /> : <ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
        {group.active ? "Archiver" : "Rétablir"}
      </SecondaryButton>
    </li>
  );
}
