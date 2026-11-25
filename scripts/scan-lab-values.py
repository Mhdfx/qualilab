"""
Scan for the laboratory's values before a commit — the repository is PUBLIC.

Reads the laboratory's files kept OUT of git (backups/fichiers-labo-*/,
ignored) and looks for their values, as exact substrings, in what is about
to be committed: by default the lines added by the staged diff, or a range
of commits (--range A..B), or whole files (--files PATH...). It prints the
place of each hit and its kind only — never the value, unless --show (on a
local terminal, never in a log that leaves the machine).

What counts as a value of the laboratory (relecture du lot 6, constat 3),
in the files the laboratory filled (not the templates — the ONSSA canevas,
the « modèles » — whose texts are the official wording; their numbers are
still compared):
  * a text cell of 6 characters or more (a supplier's name…), or of 5 with a
    digit (an order or invoice number, a lot, a code), found as a whole word
    — but the column titles (« Entrée/C500 », « Stock/ml »…) and the common
    words of the journal (payment modes, statuses);
  * a number of 1 000 or more, or of 100 or more with centimes (a price, an
    amount, a count) — but the years and the round figures any synthetic
    test computes (multiples of 1 000; multiples of 10 under 10 000).
Small numbers are not checked: too common. A hit is a place to look at,
not always a leak (a coincidence with a synthetic value is possible).

Usage (repository root):
  python scripts/scan-lab-values.py                 # staged lines (git add first)
  python scripts/scan-lab-values.py --range c608cf7..HEAD
  python scripts/scan-lab-values.py --files RETOUR-LABO-25-11.md src/lib/x.test.ts
  python scripts/scan-lab-values.py --show ...      # also print the value found
Needs openpyxl (and xlrd for an .xls). Exit code 1 when something is found.
"""
import argparse
import glob
import os
import re
import subprocess
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMMON_WORDS = {
    "virement", "payée", "payee", "payé", "réglée", "caisse", "espèce", "espèces", "espece", "chèque", "cheque",
    "prélèvement", "prelevement", "prélevement", "carte", "versement", "versement compte", "à payer", "fournisseurs", "fournisseur", "montant",
    "statut", "date paiement", "mode de paiement", "délai de paiement", "echéance", "échéance", "n° facture",
    "libellé", "expiration", "entrée", "sortie", "stock", "prix unitaire", "prix total", "lieu de stockage",
}
NUMBER = re.compile(r"(?<![\w.,])(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?![\w])")


def cells_of(path):
    """(text cells, number cells) of a workbook: header rows (the first one of each sheet) skipped."""
    texts, numbers = set(), set()
    if path.lower().endswith(".xls"):
        import xlrd  # noqa: PLC0415

        book = xlrd.open_workbook(path)
        for sheet in book.sheets():
            for r in range(1, sheet.nrows):
                for cell in sheet.row(r):
                    if cell.ctype == xlrd.XL_CELL_TEXT:
                        texts.add(cell.value)
                    elif cell.ctype == xlrd.XL_CELL_NUMBER:
                        numbers.add(cell.value)
        return texts, numbers
    import openpyxl  # noqa: PLC0415

    book = openpyxl.load_workbook(path, data_only=True, read_only=True)
    for sheet in book.worksheets:
        for r, row in enumerate(sheet.iter_rows(values_only=True)):
            if r == 0:
                continue
            for value in row:
                if isinstance(value, str):
                    texts.add(value)
                elif isinstance(value, (int, float)) and not isinstance(value, bool):
                    numbers.add(value)
    return texts, numbers


def as_number(text):
    match = re.fullmatch(r"\s*(\d[\d   ]*)(?:[.,](\d+))?\s*", text)
    if not match:
        return None
    return float(re.sub(r"\D", "", match.group(1)) + ("." + match.group(2) if match.group(2) else ""))


def lab_values():
    strings, numbers = set(), set()
    files = [f for f in glob.glob(os.path.join(ROOT, "backups", "fichiers-labo-*", "*")) if re.search(r"\.xlsx?$", f, re.I) and not os.path.basename(f).startswith("~$")]
    if not files:
        sys.exit("Aucun fichier du laboratoire dans backups/fichiers-labo-*/ : rien à comparer.")
    for path in files:
        template = re.search(r"canevas|modele|modèle|onssa", os.path.basename(path), re.I) is not None
        texts, cells = cells_of(path)
        for text in texts:
            value = " ".join(unicodedata.normalize("NFC", text).split())
            numeric = as_number(value)
            if numeric is not None:
                cells.add(numeric)
                continue
            low = value.lower()
            # The templates' texts are the official wording; a column title is structure.
            if template or low in COMMON_WORDS or re.search(r"(^|\s)(entr[ée]es?|stock|sortie|prix)\b", low):
                continue
            if len(value) >= (5 if re.search(r"\d", value) else 6):
                strings.add(low)
        for number in cells:
            whole = abs(number - round(number)) < 0.005
            if whole and (1900 <= round(number) <= 2100 or round(number) % 1000 == 0 or (round(number) < 10_000 and round(number) % 10 == 0)):
                continue
            if (whole and number >= 1000) or (not whole and number >= 100):
                numbers.add(round(float(number), 2))
    return strings, numbers


def added_lines(args):
    if args.files:
        for path in args.files:
            with open(path, encoding="utf-8", errors="replace") as handle:
                for number, line in enumerate(handle, 1):
                    yield path, number, line
        return
    command = ["git", "diff", "-U0", "--no-color"] + ([args.range] if args.range else ["--cached"])
    diff = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", check=True).stdout
    path, number = None, 0
    for line in diff.splitlines():
        if line.startswith("+++ "):
            path = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("@@"):
            number = int(re.search(r"\+(\d+)", line).group(1))
        elif line.startswith("+") and path:
            yield path, number, line[1:]
            number += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--range")
    parser.add_argument("--files", nargs="+")
    parser.add_argument("--show", action="store_true")
    args = parser.parse_args()
    strings, numbers = lab_values()
    hits = 0
    for path, number, line in added_lines(args):
        low = line.lower()
        for value in strings:
            at = low.find(value)
            # A whole word: « 61/26 » is not « 1/26 ».
            while at >= 0 and ((at > 0 and (low[at - 1].isalnum() or low[at - 1] in "/-.")) or (at + len(value) < len(low) and (low[at + len(value)].isalnum() or low[at + len(value)] in "/-"))):
                at = low.find(value, at + 1)
            if at >= 0:
                hits += 1
                print(f"{path}:{number}: texte du laboratoire" + (f" « {value} »" if args.show else ""))
        for match in NUMBER.finditer(line):
            value = float(re.sub(r"\D", "", match.group(1)) + ("." + match.group(2) if match.group(2) else ""))
            if round(value, 2) in numbers:
                hits += 1
                print(f"{path}:{number}: nombre du laboratoire" + (f" « {match.group(0)} »" if args.show else ""))
    print(f"{hits} valeur(s) du laboratoire trouvée(s) — {len(strings)} textes et {len(numbers)} nombres comparés.")
    sys.exit(1 if hits else 0)


if __name__ == "__main__":
    main()
