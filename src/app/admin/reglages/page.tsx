import { requireRole } from "@/lib/auth";
import { getLabSettings } from "@/lib/lab-settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { LabSettingsForm } from "@/components/admin/LabSettingsForm";
import { ConclusionScaleForm } from "@/components/admin/ConclusionScaleForm";
import { CountersForm, type CounterRow } from "@/components/admin/CountersForm";
import { parseLabNumber } from "@/lib/counters";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Réglages du circuit" };

export default async function ReglagesPage() {
  await requireRole("ADMIN");

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Réglages du circuit"
        subtitle="Les décisions de fonctionnement en attente du laboratoire — les deux comportements existent, le réglage choisit."
      />
      <div className="max-w-3xl space-y-5">
        <LabSettingsForm
          initial={await getLabSettings()}
          regulations={await prisma.regulation.findMany({
            where: { active: true },
            select: { id: true, title: true },
            orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
          })}
        />
        <ConclusionScaleForm initial={await prisma.conclusionScale.findMany()} />
        <CountersForm initial={await loadCounters()} />
      </div>
    </div>
  );
}

/** The two yearly sequences of the current year, with the highest number in use. */
async function loadCounters(): Promise<CounterRow[]> {
  const year = new Date().getFullYear();
  const suffix = `/${String(year % 100).padStart(2, "0")}`;
  const [rows, series, samples] = await Promise.all([
    prisma.counter.findMany({ where: { year } }),
    prisma.serie.findMany({ where: { year }, select: { serialNumber: true } }),
    prisma.sample.findMany({ where: { controlCode: { endsWith: suffix } }, select: { controlCode: true } }),
  ]);
  const highest = (numbers: string[]) => numbers.reduce((max, n) => Math.max(max, parseLabNumber(n)?.sequence ?? 0), 0);
  return [
    { kind: "SERIE", year, last: rows.find((r) => r.kind === "SERIE")?.last ?? 0, highestUsed: highest(series.map((s) => s.serialNumber)) },
    { kind: "CONTROLE", year, last: rows.find((r) => r.kind === "CONTROLE")?.last ?? 0, highestUsed: highest(samples.map((s) => s.controlCode ?? "")) },
  ];
}

