/**
 * Grouping a list of samples by their série, keeping the list's own order
 * (the first sample of a série places the group) — the technician and
 * validation queues read by cooler, not by tube (WORKFLOW.md §3.4).
 *
 * A technician's blind bench (re-ask 2.15, `benchHidesClient`) loads no
 * client: its groups carry no client name (null), and say « Série NN » only.
 */
export type SerieGroup<T> = {
  serialNumber: string;
  clientName: string | null;
  items: T[];
};

export function groupBySerie<T extends { serie: { serialNumber: string }; client?: { name: string } | null }>(
  items: T[]
): SerieGroup<T>[] {
  const groups = new Map<string, SerieGroup<T>>();
  for (const item of items) {
    const key = item.serie.serialNumber;
    let group = groups.get(key);
    if (!group) {
      group = { serialNumber: key, clientName: item.client?.name ?? null, items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
