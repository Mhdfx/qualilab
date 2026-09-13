import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { getMariaDbConfig } from "../src/lib/database-url";

/** Sanity check of the Phase 9 backfill on any database (dev or prod). */
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(getMariaDbConfig()) });

async function main() {
  const [natures, series, samples, counters, refs] = await Promise.all([
    prisma.analysisNature.count({ where: { active: true } }),
    prisma.serie.count(),
    prisma.sample.count(),
    prisma.counter.findMany({ orderBy: [{ kind: "asc" }, { year: "asc" }] }),
    prisma.documentReference.count(),
  ]);
  const withoutSerie = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) n FROM \`Sample\` WHERE \`serieId\` IS NULL OR \`natureId\` IS NULL`;
  const last = await prisma.serie.findFirst({
    orderBy: { createdAt: "desc" },
    include: { samples: { select: { code: true, lineNumber: true, lineKind: true, nature: { select: { code: true } } } } },
  });
  console.log(JSON.stringify({ natures, series, samples, orphans: Number(withoutSerie[0]?.n ?? 0), counters, refs, lastSerie: last?.serialNumber, lines: last?.samples }, null, 1));
}

main().finally(() => prisma.$disconnect());
