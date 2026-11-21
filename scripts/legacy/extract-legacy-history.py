#!/usr/bin/env python3
"""
Extracts the old software's history — every sample it reported, with its
analyses and its per-unit readings — from the restored Firebird base into
monthly NDJSON files that « Importer l'historique de l'ancien logiciel »
(/admin/import, lot 5B, HA2 — RETOUR-LABO-20-11.md §6) reads one at a time.

The tables (found on the base on 21/11, HA2-a — `schema.md` beside the files):

  BONCOMMAND            the visit: CODE/ANNE = N° de série (« 2772/26 »),
                        ID_CLIENT (always a TYPECLIENT 101 client), IDSITE
                        (a TYPECLIENT 102 site, or null), DATEBC
  LIN_BON_COMMANDE      the sample: ID_LIGNE, NUM/ANNE = N° de contrôle
                        (« 20459/26 », also the report's number — « Ce
                        rapport annule et remplace le rapport N° 2314/17 »),
                        ETAT (3 = validé), ANNULER (9 = annulé), the type
                        d'analyse (ID_TYPEANALYSE → NATURE_ECHANTILLION), the
                        family (ID_TYPENOURI → TYPE_NOURITURE), the désignation
                        (ID_PRODUIT → PRODUIT), the place (LIEU_PRELEVEMENT),
                        NUM_LOT, DATE_PRELEV / HEURE_PRELEV, DATE_RECEPTION
  VALIDETAT_INFO        the report of a sample (IDLIGNE): DATEVALIDATION,
                        CONCLUSION printed when PCONCLU = 1, OBSERVATION when
                        POBSRV = 1, the amendment's note NAMENDM when
                        PAMENDM = 1, FORMAT_NUM (how its numbers print)
  SAISIE_RESULTAT       one per sample (ID_ECHANTION): CONCLU_RESULT, the
                        sample's verdict (codes of LES_CONCLUSION_ECHANTION)
  PARAMES_BON_COMMANDE  one analysis of a sample: ID_PARAM → TYPENOURITURE_PARAMS
                        (the parameter, its norm, unit, order and criterion)
  RESULTA_LIGNES        one reading per unit (NUM_ECHE 1…n) of an analysis
                        (ID_LIGNEBC): RESULTA × 10^EXP_R, OPER (« < », « > »,
                        « NE »…), CONCLUSION (the unit's verdict), TYPE_RESULTAT
                        (11 number, 12 presence / absence in RESULT_BINAIR,
                        13 text in OBSERVATION)

Only the samples the old software validated (ETAT = 3) and did not cancel
are written in full; a cancelled sample is written as a stub
`{"id": …, "cancelled": true}` so that the import hides one it brought
before (hypothèse, à confirmer par D-7); the samples still in progress come
with the next run. No price, no member of the staff (sampler, receiver,
validator) is written.

The base runs in a Docker container (default `qlabo-fb`, Firebird 3,
SYSDBA / quali — see the project notes) and is only read. Only this script
is committed: the files name clients, so they go to `backups/` (ignored by
git), never into the public repository.

    python scripts/legacy/extract-legacy-history.py [--container qlabo-fb] [--out backups/historique-ancien]

Writes, in `--out`:
  historique-AAAA-MM.ndjson   one per month of reception (cut into -a, -b…
                              under MAX_BYTES), first line the file's header
  clients.csv                 the old software's clients that own at least
                              one sample written (with ICE), for the step
                              « Rattacher les clients »
  comptes.md                  the counts by year (HA7) and the unreadable rows
"""
import argparse
import csv
import datetime as dt
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict

_spec = importlib.util.spec_from_file_location("extract_legacy", os.path.join(os.path.dirname(os.path.abspath(__file__)), "extract-legacy.py"))
legacy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(legacy)

s, n = legacy.s, legacy.n
SENTINEL = "~R~"
SEP = "|"

# The import route's ceiling (`MAX_FILE_CHARS`, src/lib/legacy-history-import.ts — the
# 8 Mo of the other imports): a month bigger than this is cut, with a margin.
MAX_BYTES = 7_500_000
FILE_VERSION = 1
VALIDATED = 3
CANCELLED = 9


def row(*parts: str) -> str:
    """One output cell, the parts joined — isql in list mode does not pad it."""
    return f"CAST('{SENTINEL}' || " + " || '|' || ".join(parts) + " AS VARCHAR(8000)) AS X"


def run(container: str, sql: str, width: int) -> list[list[str]]:
    """The rows of a query, through isql in list mode (no padding: the
    hundreds of thousands of rows stay a few tens of megabytes)."""
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write("SET LIST ON;\n" + sql)
        path = f.name
    try:
        subprocess.run(["docker", "cp", path, f"{container}:/tmp/history.sql"], check=True)
        env = dict(os.environ, MSYS_NO_PATHCONV="1")
        out = subprocess.run(
            ["docker", "exec", container, "isql", "-user", "SYSDBA", "-password", "quali", "-pag", "0", "-ch", "UTF8",
             "/var/lib/firebird/data/qlabo.fdb", "-i", "/tmp/history.sql"],
            check=True, capture_output=True, env=env,
        ).stdout
    finally:
        os.unlink(path)
    rows, bad = [], 0
    for raw in out.splitlines():
        line = legacy.decode_mixed(raw).rstrip()
        at = line.find(SENTINEL)
        if at < 0:
            continue
        cells = [cell.strip() for cell in line[at + len(SENTINEL):].split(SEP)]
        if len(cells) != width:
            bad += 1
            continue
        rows.append(cells)
    if bad:
        UNREADABLE[sql.split("FROM", 1)[1].split()[0]] += bad
    return rows


UNREADABLE: Counter = Counter()


def to_int(value: str):
    try:
        return int(value)
    except ValueError:
        return None


def text(value: str):
    value = value.strip()
    return value or None


def date_part(value: str):
    """« 2026-09-07 » of a DATE or TIMESTAMP cell, or None."""
    value = value.strip()
    return value[:10] if len(value) >= 10 and value[4] == "-" else None


def time_part(value: str):
    """« 09:00 » of a TIME cell (« 09:00:00.0000 »), or None — midnight too (« not typed »)."""
    value = value.strip()
    if len(value) < 5 or value[2] != ":":
        return None
    return None if value.startswith("00:00:00") else value[:5]


def instant(day, time):
    if not day:
        return None
    return f"{day}T{time}:00" if time else day


def number_text(value: str):
    """« 1.7000 » → « 1.7 » (the raw value, dot-decimal: the import formats it)."""
    value = value.strip()
    if not value:
        return None
    if "." in value:
        value = value.rstrip("0").rstrip(".")
    return value or "0"


def bound(lines: list, kind: int):
    """MAXVAL × 10^EXP_MAX of the first interval line whose conclusion is `kind` (2 = m, 1 = M)."""
    for line in lines:
        if to_int(line[4]) == kind and line[2]:
            return (number_text(line[2]), to_int(line[3]) or 0)
    return None


def criterion_of(t: list):
    """The criterion of the old software's own row — the one it prints today on
    a reprint (it reads TYPENOURITURE_PARAMS live), as data: the import writes
    it in clear, knowing how many units were read (`legacyCriterionText`,
    src/lib/legacy-history.ts). n, c, m and M as [mantissa, power of ten]."""
    type_pm, nbr, control = to_int(t[5]), to_int(t[7]), to_int(t[8])
    n_units = nbr if nbr and nbr > 0 else 1
    lines = [t[11 + 6 * i: 17 + 6 * i] for i in range(3)]
    if type_pm == 1:
        return {"n": n_units, "abs": 1}
    m, big_m = bound(lines, 2), bound(lines, 1)
    if m is None and big_m is None and t[9]:
        m = (number_text(t[9]), to_int(t[10]) or 0)
    if m is None and big_m is None:
        return None
    out = {"n": n_units}
    if control is not None and m is not None and big_m is not None:
        out["c"] = control
    if m is not None:
        out["m"] = list(m)
    if big_m is not None:
        out["M"] = list(big_m)
    return out


def valid_day(value, latest_year: int):
    """A date the old software holds for real: « 1899-12-30 » (its empty date)
    and typos (« 0203-02-… », « 2224-… ») are none."""
    if not value:
        return None
    year = to_int(value[:4]) or 0
    return value if 2000 <= year <= latest_year else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", default="qlabo-fb")
    parser.add_argument("--out", default=os.path.join("backups", "historique-ancien"))
    args = parser.parse_args()
    started = dt.datetime.now()

    def step(label: str):
        print(f"[{(dt.datetime.now() - started).seconds:>4} s] {label}", flush=True)

    # ---- the catalogue of the analyses (one row per family × parameter) ----------------------
    step("paramètres et critères")
    interval = lambda a: [n(f"{a}.MINVAL"), n(f"{a}.EXP_MIN"), n(f"{a}.MAXVAL"), n(f"{a}.EXP_MAX"), n(f"{a}.CONCLUSION"), n(f"{a}.OPERATEUR")]  # noqa: E731
    tnp_rows = run(args.container, f"""SELECT {row(n('t.ID'), s('l.LIBELLE'), s('nm.VALEUR'), s('un.NOM'), n('t.LORDRE'), n('t.TYPE_PM'), n('t.TYPE_RESULTAT'), n('t.NBR'), n('t.CONTROL'), n('t.VALEUR_PM'), n('t.EXPM'), *interval('i1'), *interval('i2'), *interval('i3'))}
        FROM TYPENOURITURE_PARAMS t
        LEFT JOIN PARAMETRES p ON p.ID = t.PARAMS
        LEFT JOIN LISTE_PARAMETRES l ON l.IDPARAM = p.ID_PARAM
        LEFT JOIN NORMES nm ON nm.ID = p.ID_NORME
        LEFT JOIN UNITES un ON un.ID = t.UNITE
        LEFT JOIN INTERVAL_PETITM i1 ON i1.ID_TNP = t.ID AND i1.NLIN = 1
        LEFT JOIN INTERVAL_PETITM i2 ON i2.ID_TNP = t.ID AND i2.NLIN = 2
        LEFT JOIN INTERVAL_PETITM i3 ON i3.ID_TNP = t.ID AND i3.NLIN = 3;""", 29)
    analyses = {}
    for t in tnp_rows:
        analyses[int(t[0])] = {
            "parameter": text(t[1]),
            "method": text(t[2]),
            "unit": text(t[3]),
            "order": to_int(t[4]),
            "criterion": criterion_of(t),
        }

    step("listes (types d'analyse, familles, désignations, lieux)")
    lookups = {}
    for name, sql in {
        "nature": f"SELECT {row(n('ID'), s('LIBELLE'))} FROM NATURE_ECHANTILLION;",
        "family": f"SELECT {row(n('ID'), s('LIBELLE'))} FROM TYPE_NOURITURE;",
        "product": f"SELECT {row(n('ID'), s('LIBELLE'))} FROM PRODUIT;",
        "place": f"SELECT {row(n('ID'), s('LIBELLE'))} FROM LIEU_PRELEVEMENT;",
    }.items():
        lookups[name] = {int(r[0]): text(r[1]) for r in run(args.container, sql, 2) if r[0]}

    step("clients")
    clients = {int(r[0]): r for r in run(args.container, f"SELECT {row(n('ID'), s('NOM'), s('ICE'), n('OBSOLETE'))} FROM CLIENTS WHERE TYPECLIENT = 101;", 4)}

    # ---- the samples ------------------------------------------------------------------------
    step("échantillons")
    samples = run(args.container, f"""SELECT {row(n('l.ID_LIGNE'), n('l.NUM'), n('l.ANNE'), n('b.CODE'), n('b.ANNE'), n('b.ID_CLIENT'), n('b.IDSITE'),
        n('l.ID_TYPEANALYSE'), n('l.ID_TYPENOURI'), n('l.ID_PRODUIT'), n('l.LIEU_PRELEVEMENT'), s('l.NUM_LOT'),
        n('l.DATE_PRELEV'), n('l.HEURE_PRELEV'), n('l.DATE_RECEPTION'), n('l.HEUR_RECEPTION'), n('l.ETAT'), n('l.ANNULER'), n('b.DATEBC'))}
        FROM LIN_BON_COMMANDE l JOIN BONCOMMAND b ON b.ID = l.NUM_BC;""", 19)
    step("rapports (validation, conclusion)")
    reports = {int(r[0]): r for r in run(args.container, f"""SELECT {row(n('IDLIGNE'), n('DATEVALIDATION'), n('PCONCLU'), s('CONCLUSION'), n('POBSRV'), s('OBSERVATION'), n('PAMENDM'), s('NAMENDM'), s('FORMAT_NUM'))}
        FROM VALIDETAT_INFO;""", 9)}
    step("verdicts des échantillons")
    verdicts = {}
    for r in run(args.container, f"SELECT {row(n('ID_ECHANTION'), n('CONCLU_RESULT'), n('DATE_VALIDATION'))} FROM SAISIE_RESULTAT;", 3):
        verdicts[int(r[0])] = (to_int(r[1]), date_part(r[2]))

    step("analyses demandées")
    analyses_of = defaultdict(list)
    for r in run(args.container, f"SELECT {row(n('ID'), n('ID_ECHANTION'), n('ID_PARAM'))} FROM PARAMES_BON_COMMANDE;", 3):
        analyses_of[int(r[1])].append((int(r[0]), to_int(r[2])))
    step("lectures par unité")
    readings_of = defaultdict(list)
    for r in run(args.container, f"""SELECT {row(n('ID_LIGNEBC'), n('NUM_ECHE'), n('RESULTA'), n('EXP_R'), n('CONCLUSION'), s('OPER'), n('TYPE_RESULTAT'), n('RESULT_BINAIR'), s('OBSERVATION'))}
        FROM RESULTA_LIGNES;""", 9):
        readings_of[int(r[0])].append(r)

    # ---- the lines ---------------------------------------------------------------------------
    step("fichiers mensuels")
    by_month = defaultdict(list)
    years = defaultdict(Counter)
    clients_used = defaultdict(lambda: {"samples": 0, "first": None, "last": None})
    for r in samples:
        sample_id, year = int(r[0]), to_int(r[2]) or 0
        state, cancelled = to_int(r[16]), to_int(r[17]) == CANCELLED
        latest = dt.date.today().year + 1
        sampled_day = valid_day(date_part(r[12]), latest)
        received_day = valid_day(date_part(r[14]), latest)
        # The month of the file: the reception, typed by the laboratory (the
        # sampling date holds typos — a day and a month swapped); else the visit.
        day = received_day or valid_day(date_part(r[18]), latest) or sampled_day
        month = day[:7] if day else f"{year:04d}-00"
        counts = years[year]
        counts["échantillons"] += 1
        if cancelled:
            counts["annulés"] += 1
            by_month[month].append({"id": sample_id, "cancelled": True})
            continue
        if state != VALIDATED:
            counts["en cours (non repris)"] += 1
            continue
        client_id = to_int(r[5])
        report = reports.get(sample_id)
        verdict, validated_on = verdicts.get(sample_id, (None, None))
        results = []
        for analysis_id, tnp_id in analyses_of.get(sample_id, []):
            catalogue = analyses.get(tnp_id) or {}
            readings = []
            for x in sorted(readings_of.get(analysis_id, []), key=lambda x: to_int(x[1]) or 0):
                reading = {
                    "u": to_int(x[1]),
                    "v": number_text(x[2]),
                    "e": to_int(x[3]),
                    "c": to_int(x[4]),
                    "op": text(x[5]),
                    "k": to_int(x[6]),
                    "b": to_int(x[7]),
                    "t": text(x[8]),
                }
                readings.append({k: v for k, v in reading.items() if v is not None})
            counts["lectures"] += len(readings)
            results.append({
                "id": analysis_id,
                "pos": catalogue.get("order"),
                "parameter": catalogue.get("parameter"),
                "method": catalogue.get("method"),
                "unit": catalogue.get("unit"),
                "criterion": catalogue.get("criterion"),
                "readings": readings,
            })
        results.sort(key=lambda a: ((a["pos"] if a["pos"] is not None else 10**6), a["id"]))
        counts["analyses"] += len(results)
        counts["repris"] += 1
        control = f"{r[1]}/{year % 100:02d}" if r[1] and year else None
        serie_year = to_int(r[4]) or year
        line = {
            "id": sample_id,
            "client": client_id,
            "site": to_int(r[6]) or None,
            "serie": f"{r[3]}/{serie_year % 100:02d}" if r[3] and serie_year else None,
            "control": control,
            "year": year,
            "nature": lookups["nature"].get(to_int(r[7]) or -1),
            "productType": lookups["family"].get(to_int(r[8]) or -1),
            "designation": lookups["product"].get(to_int(r[9]) or -1),
            "lot": text(r[11]),
            "place": lookups["place"].get(to_int(r[10]) or -1),
            "sampledAt": instant(sampled_day, time_part(r[13])),
            "receivedAt": instant(received_day, time_part(r[15])),
            # The report carries the N° de contrôle (« … annule et remplace le rapport N° 2314/17 »).
            "reportNumber": control,
            "reportedAt": valid_day((date_part(report[1]) if report else None) or validated_on, latest),
            "verdict": verdict,
            "conclusion": text(report[3]) if report and to_int(report[2]) == 1 else None,
            "observation": text(report[5]) if report and to_int(report[4]) == 1 else None,
            "amendment": text(report[7]) if report and to_int(report[6]) == 1 else None,
            "format": text(report[8]) if report else None,
            "results": results,
        }
        by_month[month].append({k: v for k, v in line.items() if v is not None})
        used = clients_used[client_id]
        used["samples"] += 1
        used["first"] = year if used["first"] is None else min(used["first"], year)
        used["last"] = year if used["last"] is None else max(used["last"], year)

    os.makedirs(args.out, exist_ok=True)
    for old in os.listdir(args.out):
        if old.startswith("historique-") and old.endswith(".ndjson"):
            os.unlink(os.path.join(args.out, old))
    extracted_at = dt.datetime.now().replace(microsecond=0).isoformat()
    files, biggest = [], 0
    for month in sorted(by_month):
        lines = [json.dumps(x, ensure_ascii=False, separators=(",", ":")) for x in sorted(by_month[month], key=lambda x: x["id"])]
        parts, current, size = [], [], 0
        for line in lines:
            if current and size + len(line.encode("utf-8")) + 1 > MAX_BYTES:
                parts.append(current)
                current, size = [], 0
            current.append(line)
            size += len(line.encode("utf-8")) + 1
        parts.append(current)
        for index, part in enumerate(parts):
            suffix = f"-{chr(ord('a') + index)}" if len(parts) > 1 else ""
            name = f"historique-{month}{suffix}.ndjson"
            header = json.dumps({
                "kind": "qualilab-historique-ancien",
                "version": FILE_VERSION,
                "month": month,
                "part": index + 1,
                "parts": len(parts),
                "lines": len(part),
                "extractedAt": extracted_at,
            }, separators=(",", ":"))
            path = os.path.join(args.out, name)
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(header + "\n" + "\n".join(part) + "\n")
            size = os.path.getsize(path)
            biggest = max(biggest, size)
            files.append((name, len(part), size))

    with open(os.path.join(args.out, "clients.csv"), "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["legacyClientId", "client", "ice", "obsolete", "echantillons", "premiereAnnee", "derniereAnnee"])
        for client_id in sorted(clients_used):
            c = clients.get(client_id)
            used = clients_used[client_id]
            writer.writerow([client_id, c[1] if c else "", c[2] if c else "", c[3] if c else "", used["samples"], used["first"], used["last"]])

    total = Counter()
    for counts in years.values():
        total.update(counts)
    columns = ["échantillons", "repris", "annulés", "en cours (non repris)", "analyses", "lectures"]
    report_lines = [
        f"# Historique de l'ancien logiciel — comptes de l'extraction du {extracted_at[:10]}",
        "",
        "| Année | " + " | ".join(columns) + " |",
        "|---|" + "---:|" * len(columns),
    ]
    for year in sorted(years):
        report_lines.append(f"| {year} | " + " | ".join(f"{years[year][c]:,}".replace(",", " ") for c in columns) + " |")
    report_lines.append("| **Total** | " + " | ".join(f"**{total[c]:,}**".replace(",", " ") for c in columns) + " |")
    report_lines += [
        "",
        f"- Clients de l'ancien logiciel ayant au moins un échantillon repris : {len(clients_used)}",
        f"- Fichiers : {len(files)} (le plus gros : {biggest / 1_000_000:.2f} Mo ; plafond de coupe {MAX_BYTES / 1_000_000:.1f} Mo)",
        f"- Lignes illisibles (nombre de cellules inattendu) : {sum(UNREADABLE.values())}" + (f" ({dict(UNREADABLE)})" if UNREADABLE else ""),
        f"- Durée : {(dt.datetime.now() - started).seconds} s",
    ]
    with open(os.path.join(args.out, "comptes.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(report_lines) + "\n")
    print("\n".join(report_lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
