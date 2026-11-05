#!/usr/bin/env python3
"""
Extracts the prices proper to each client from the old software's restored
Firebird base (lot 4H, H5 — RETOUR-LABO-04-11.md §5, R-4 « Oui ») into one
CSV file that « Importer les prix clients » (/admin/import) reads.

  PRIX_PARAME_PARCLIENTS  the ≈ 6 700 prices: one row per client and
                          PARAMETRES row (a parameter within a type
                          d'analyse — ID_ECHANTILLION, matched to
                          AnalysisNature.legacyId), with the price HT, the
                          last change, a discount column (always 0)
  CLIENTS                 the client (or the site, TYPECLIENT 102) the price
                          belongs to: name, ICE, obsolete flag, parent
  LISTE_PARAMETRES        the parameter's label (LIBELLE)

PRIX_ANALYSE_PARCLIENT (18 rows priced by « analyse », a grouping the old
software no longer documents) and the empty PRIX_PARCLIENT / GROUPES_PRIX
are left out (RETOUR-LABO-04-11.md §5, H5).

The base runs in a Docker container (default `qlabo-fb`, Firebird 3,
SYSDBA / quali — see the project notes) and is only read. Only this script
is committed: the CSV names clients, so it goes to `backups/` (ignored by
git), never into the public repo.

    python scripts/legacy/extract-client-prices.py [--container qlabo-fb] [--out backups]
"""
import argparse
import csv
import importlib.util
import os
import sys

# The query helpers and the mixed UTF-8 / cp1252 decoding of the catalogue
# extraction (extract-legacy.py), reused as they are.
_spec = importlib.util.spec_from_file_location("extract_legacy", os.path.join(os.path.dirname(os.path.abspath(__file__)), "extract-legacy.py"))
legacy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(legacy)

FILE_NAME = "prix-clients-ancienne-base.csv"

# Header = CLIENT_PRICE_FILE_HEADER (src/lib/client-prices-import.ts).
HEADER = [
    "legacyPriceId",
    "legacyClientId",
    "clientType",
    "client",
    "ice",
    "clientObsolete",
    "legacyParentId",
    "parent",
    "legacyParamId",
    "legacyNatureId",
    "parametre",
    "prix",
    "derniereModification",
]

s, n, cols = legacy.s, legacy.n, legacy.cols

SQL = f"""SELECT {cols(
    n('x.ID'), n('c.ID'), n('c.TYPECLIENT'), s('c.NOM'), s('c.ICE'), n('c.OBSOLETE'),
    n('c.ID_HAUTE'), s('h.NOM'),
    n('p.ID'), n('p.ID_ECHANTILLION'), s('l.LIBELLE'),
    n('x.PRIX'), n('x.LAST_MODIF'))}
FROM PRIX_PARAME_PARCLIENTS x
JOIN CLIENTS c ON c.ID = x.IDCLIENT
LEFT JOIN CLIENTS h ON h.ID = c.ID_HAUTE
LEFT JOIN PARAMETRES p ON p.ID = x.IDPARAMANALYSE
LEFT JOIN LISTE_PARAMETRES l ON l.IDPARAM = p.ID_PARAM
ORDER BY x.ID;"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", default="qlabo-fb")
    parser.add_argument("--out", default="backups")
    args = parser.parse_args()
    rows = legacy.run_isql(args.container, SQL)
    bad = [r for r in rows if len(r) != len(HEADER)]
    if bad:
        print(f"{len(bad)} row(s) with an unexpected number of cells, e.g. {bad[0][:3]}", file=sys.stderr)
        return 1
    for r in rows:
        # « 2022-02-22 10:12:26.3870 » → « 2022-02-22 10:12:26 ».
        r[12] = r[12].split(".")[0]
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, FILE_NAME)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(HEADER)
        writer.writerows(rows)
    clients = len({r[1] for r in rows})
    print(f"{path}: {len(rows)} prix, {clients} clients")
    return 0


if __name__ == "__main__":
    sys.exit(main())
