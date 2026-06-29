const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit",
  "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];

const TENS: Record<number, string> = {
  20: "vingt",
  30: "trente",
  40: "quarante",
  50: "cinquante",
  60: "soixante",
  80: "quatre-vingt",
};

function below100(n: number): string {
  if (n < 20) return UNITS[n];

  if (n < 70) {
    const ten = Math.floor(n / 10) * 10;
    const unit = n % 10;
    if (unit === 0) return TENS[ten];
    if (unit === 1) return `${TENS[ten]} et un`;
    return `${TENS[ten]}-${UNITS[unit]}`;
  }

  if (n < 80) {
    const unit = n - 60;
    if (unit === 11) return "soixante et onze";
    return `soixante-${UNITS[unit]}`;
  }

  // 80-99
  const unit = n - 80;
  if (unit === 0) return "quatre-vingts";
  return `quatre-vingt-${UNITS[unit]}`;
}

function below1000(n: number): string {
  if (n < 100) return below100(n);

  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const hundredWord =
    hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent`;

  if (rest === 0) {
    return hundreds === 1 ? "cent" : `${UNITS[hundreds]} cents`;
  }
  return `${hundredWord} ${below100(rest)}`;
}

function integerToWords(n: number): string {
  if (n === 0) return "zéro";

  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];

  if (millions > 0) {
    parts.push(
      millions === 1 ? "un million" : `${below1000(millions)} millions`
    );
  }

  if (thousands > 0) {
    parts.push(thousands === 1 ? "mille" : `${below1000(thousands)} mille`);
  }

  if (rest > 0) {
    parts.push(below1000(rest));
  }

  return parts.join(" ");
}

/** Convert an amount to French words, e.g. "mille deux cent cinquante dirhams et 50 centimes". */
export function amountToFrenchWords(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const dirhams = Math.floor(rounded);
  const centimes = Math.round((rounded - dirhams) * 100);

  const dirhamWords = `${integerToWords(dirhams)} ${
    dirhams <= 1 ? "dirham" : "dirhams"
  }`;

  if (centimes === 0) return dirhamWords;

  return `${dirhamWords} et ${centimes} centime${centimes > 1 ? "s" : ""}`;
}
