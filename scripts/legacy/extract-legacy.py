#!/usr/bin/env python3
"""
Extracts the old software's catalogue from its restored Firebird base
(RETOUR-LABO-30-09.md, slice J) into four CSV files the LIMS imports at
/admin/import:

  regulations.csv  GLF_CRITERES — the 176 regulation sources
  types.csv        TYPE_NOURITURE — the 634 product types, their regulation
                   and their last use
  criteria.csv     TYPENOURITURE_PARAMS × INTERVAL_PETITM — one row per
                   type × parameter, the intervals flattened (3 lines)
  clients.csv      CLIENTS — the active clients (for the client import)
  memory.csv       one row per sample since 2023: client, désignation, lieu
                   (the client memory of the designation corrector)

The base runs in a Docker container (default `qlabo-fb`, Firebird 3,
SYSDBA / quali — see the project notes). Only this script is committed:
the CSV files hold client data and stay out of the public repo
(`legacy-export/` is ignored).

    python scripts/legacy/extract-legacy.py [--container qlabo-fb] [--out legacy-export]
"""
import argparse
import csv
import os
import subprocess
import sys
import tempfile

SENTINEL = "~R~"
SEP = "|"


def clean(expr: str) -> str:
    """A text column on one line, without the delimiter."""
    return f"REPLACE(REPLACE(REPLACE({expr}, ASCII_CHAR(13), ' '), ASCII_CHAR(10), ' '), '|', '/')"


def s(expr: str) -> str:
    return f"COALESCE({clean(expr)}, '')"


def n(expr: str) -> str:
    return f"COALESCE(CAST({expr} AS VARCHAR(40)), '')"


def cols(*parts: str) -> str:
    return f"'{SENTINEL}' || " + " || '|' || ".join(parts)


INTERVAL = lambda a: [n(f"{a}.MINVAL"), n(f"{a}.EXP_MIN"), n(f"{a}.MAXVAL"), n(f"{a}.EXP_MAX"), n(f"{a}.CONCLUSION"), n(f"{a}.OPERATEUR")]  # noqa: E731

QUERIES = {
    "regulations.csv": (
        ["id", "titre", "texte", "obsolete"],
        f"SELECT {cols(n('ID'), s('TITRE'), s('LIBELLE'), n('OBSOLETE'))} FROM GLF_CRITERES;",
    ),
    "types.csv": (
        ["id", "nom", "groupe", "famille", "id_critere", "echantillon", "obsolete", "visible", "id_client", "derniere_utilisation"],
        f"""SELECT {cols(n('t.ID'), s('t.LIBELLE'), s('g.LIBELLE'), s('t.FAMILLE'), n('t.IDCRITERE'), n('t.ECHANTILLION'), n('t.OBSOLETE'), n('t.VISIBLE'), n('t.IDCLIENT'), n('u.LASTUSE'))}
        FROM TYPE_NOURITURE t
        LEFT JOIN GROUP_FAMILLES g ON g.ID = t.ID_GFAMIL
        LEFT JOIN (SELECT ID_TYPENOURI, MAX(DATE_PRELEV) AS LASTUSE FROM LIN_BON_COMMANDE GROUP BY ID_TYPENOURI) u ON u.ID_TYPENOURI = t.ID;""",
    ),
    "criteria.csv": (
        ["id", "id_type", "id_param", "parametre", "norme", "unite", "type_pm", "type_resultat", "classe", "nbr", "control", "valeur_pm", "exp_pm", "obsolete", "ordre",
         "l1_min", "l1_exp_min", "l1_max", "l1_exp_max", "l1_concl", "l1_oper",
         "l2_min", "l2_exp_min", "l2_max", "l2_exp_max", "l2_concl", "l2_oper",
         "l3_min", "l3_exp_min", "l3_max", "l3_exp_max", "l3_concl", "l3_oper"],
        f"""SELECT {cols(n('t.ID'), n('t.TYPENOURITURE'), n('t.PARAMS'), s('l.LIBELLE'), s('nm.VALEUR'), s('un.NOM'), n('t.TYPE_PM'), n('t.TYPE_RESULTAT'), n('t.CLASS'), n('t.NBR'), n('t.CONTROL'), n('t.VALEUR_PM'), n('t.EXPM'), n('t.OBSOLETE'), n('t.LORDRE'), *INTERVAL('i1'), *INTERVAL('i2'), *INTERVAL('i3'))}
        FROM TYPENOURITURE_PARAMS t
        LEFT JOIN PARAMETRES p ON p.ID = t.PARAMS
        LEFT JOIN LISTE_PARAMETRES l ON l.IDPARAM = p.ID_PARAM
        LEFT JOIN NORMES nm ON nm.ID = p.ID_NORME
        LEFT JOIN UNITES un ON un.ID = t.UNITE
        LEFT JOIN INTERVAL_PETITM i1 ON i1.ID_TNP = t.ID AND i1.NLIN = 1
        LEFT JOIN INTERVAL_PETITM i2 ON i2.ID_TNP = t.ID AND i2.NLIN = 2
        LEFT JOIN INTERVAL_PETITM i3 ON i3.ID_TNP = t.ID AND i3.NLIN = 3;""",
    ),
    "clients.csv": (
        ["Raison sociale", "ICE", "Email", "Téléphone", "Adresse", "Obsolète"],
        f"""SELECT {cols(s('c.NOM'), s('c.ICE'), s('c.EMAIL'), s('c.TEL1'), f"TRIM(COALESCE({clean('c.ADRESSE1')}, '') || ' ' || COALESCE({clean('c.ADRESSE2')}, ''))", n('c.OBSOLETE'))}
        FROM CLIENTS c
        WHERE c.NOM IS NOT NULL AND c.NOM <> '' AND (c.OBSOLETE IS NULL OR c.OBSOLETE = 0);""",
    ),
    "memory.csv": (
        ["Client", "ICE", "Désignation", "Lieu"],
        f"""SELECT {cols(s('c.NOM'), s('c.ICE'), s('pr.LIBELLE'), s('lp.LIBELLE'))}
        FROM LIN_BON_COMMANDE l
        JOIN BONCOMMAND b ON b.ID = l.NUM_BC
        JOIN CLIENTS c ON c.ID = b.ID_CLIENT
        LEFT JOIN PRODUIT pr ON pr.ID = l.ID_PRODUIT
        LEFT JOIN LIEU_PRELEVEMENT lp ON lp.ID = l.LIEU_PRELEVEMENT
        WHERE l.DATE_PRELEV >= '2023-01-01';""",
    ),
}


def decode_mixed(b: bytes) -> str:
    """The old base mixes UTF-8 with raw cp1252 bytes in the same column
    (« à » as 0xE0 next to « ° » as C2 B0): each byte run is read as UTF-8
    when it is one, as cp1252 otherwise."""
    out: list[str] = []
    i = 0
    while i < len(b):
        if b[i] < 0x80:
            out.append(chr(b[i]))
            i += 1
            continue
        for length in (2, 3, 4):
            try:
                out.append(b[i:i + length].decode("utf-8"))
                i += length
                break
            except UnicodeDecodeError:
                continue
        else:
            out.append(b[i:i + 1].decode("cp1252", errors="replace"))
            i += 1
    return "".join(out)


def run_isql(container: str, sql: str) -> list[list[str]]:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write(sql)
        path = f.name
    try:
        subprocess.run(["docker", "cp", path, f"{container}:/tmp/extract.sql"], check=True)
        env = dict(os.environ, MSYS_NO_PATHCONV="1")
        out = subprocess.run(
            ["docker", "exec", container, "isql", "-user", "SYSDBA", "-password", "quali", "-pag", "0", "-ch", "UTF8",
             "/var/lib/firebird/data/qlabo.fdb", "-i", "/tmp/extract.sql"],
            check=True, capture_output=True, env=env,
        ).stdout
    finally:
        os.unlink(path)
    rows = []
    for raw in out.splitlines():
        line = decode_mixed(raw).rstrip()
        if not line.startswith(SENTINEL):
            continue
        rows.append([cell.strip() for cell in line[len(SENTINEL):].split(SEP)])
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", default="qlabo-fb")
    parser.add_argument("--out", default="legacy-export")
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for name, (header, sql) in QUERIES.items():
        rows = run_isql(args.container, sql)
        bad = [r for r in rows if len(r) != len(header)]
        if bad:
            print(f"{name}: {len(bad)} row(s) with an unexpected number of cells, e.g. {bad[0][:3]}", file=sys.stderr)
            return 1
        if name == "clients.csv":
            # The old base keeps several addresses in one cell; the client
            # import takes one — the first, the others are added by hand.
            for r in rows:
                parts = [p.strip() for p in r[2].replace(",", ";").split(";")]
                r[2] = next((p for p in parts if "@" in p), "")
        with open(os.path.join(args.out, name), "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
            writer.writerow(header)
            writer.writerows(rows)
        print(f"{name}: {len(rows)} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
