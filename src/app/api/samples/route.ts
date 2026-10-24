import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SAMPLE_BENCH_SELECT, sampleSelectFor } from "@/lib/sample-select";
import { pageParams, toPage } from "@/lib/pagination";
import { parseSampleSearch, sampleSearchWhere } from "@/lib/sample-search";
import { benchHidesClient, benchSearchScope } from "@/lib/bench-access";

/** The roles that work the sample circuit — stock and (future) portal do not. */
const CIRCUIT_ROLES = [
  "PRELEVEUR",
  "RECEPTIONNISTE",
  "PROGRAMMATEUR",
  "TECHNICIEN",
  "VALIDATEUR",
  "DIRECTION",
  "GESTIONNAIRE",
  "COMPTABLE",
  "ADMIN",
] as const;

const STATUSES = [
  "PRELEVE",
  "RECU",
  "PROGRAMME",
  "EN_ANALYSE",
  "RESULTATS_SAISIS",
  "VALIDE",
  "RAPPORT_ENVOYE",
] as const;

export async function GET(request: Request) {
  const session = await requireApiRole(...CIRCUIT_ROLES);
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const rawStatus = params.get("status");
  if (rawStatus && !(STATUSES as readonly string[]).includes(rawStatus)) {
    return NextResponse.json({ error: "Statut inconnu." }, { status: 400 });
  }
  const status = rawStatus as (typeof STATUSES)[number] | null;

  // A préleveur only ever sees their own field work; the lab roles see all.
  // The search runs in the database, not on the loaded page — otherwise a
  // code typed by the réceptionniste would only match the 50 newest samples.
  // Filters (client, période, nature, état) are the search screen's
  // (RETOUR-LABO-29-09.md, slice F). The préleveur's search is blind: it
  // never matches the laboratory's N° de contrôle.
  // A technician's blind bench (re-ask 2.15, `benchHidesClient`) neither
  // filters by client or site nor reads them — exactly as /recherche.
  const blind = benchHidesClient(session.role);
  const parsed = parseSampleSearch(params);
  const search = blind ? { ...parsed, clientId: null, siteId: null } : parsed;
  const where = {
    ...sampleSearchWhere(search, { blind: session.role === "PRELEVEUR" }),
    ...(session.role === "PRELEVEUR" ? { userId: session.id } : {}),
    // A technician lists the samples they hold — taken (« Prendre en
    // charge », or a first result) or a legacy parameter line of theirs
    // (PROGRAMME.md §10). « À prendre » and colleagues' samples are read on
    // the bench screens (/technicien), never through this API. On a blind
    // bench the free text must also match what the sheet shows, never the
    // client, the site or the place alone (`benchSearchScope`).
    // Wrapped in AND so its OR never collides with the search's own.
    ...(session.role === "TECHNICIEN" ? { AND: [benchSearchScope(session, search.q)!] } : {}),
    ...(status ? { status } : {}),
  };

  // Never load the whole table: this list grows for the life of the laboratory.
  const { take, cursor, skip } = pageParams(request);

  const rows = await prisma.sample.findMany({
    where,
    // The préleveur's payload deliberately excludes the laboratory numbering;
    // the blind technician's, the client and the site.
    select: blind ? SAMPLE_BENCH_SELECT : sampleSelectFor(session.role),
    orderBy: { createdAt: "desc" },
    take: take + 1,
    cursor,
    skip,
  });

  return NextResponse.json(toPage(rows, take));
}
