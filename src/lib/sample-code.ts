import { randomInt } from "node:crypto";
import { prisma } from "./prisma";

/**
 * Sample numbering.
 *
 * Three identifiers, deliberately separate:
 *
 * - `code` (QL-YYYY-NNNNN) — the field reference the préleveur creates and sees.
 * - `controlCode` (QLC-YYYY-NNNNN) — the official traceable number, assigned at
 *   RECEPTION. Sequential, so the lab can follow its register.
 * - `serialNumber` (SN-XXXX-XXXX) — the **blind analysis number**, assigned at
 *   reception and drawn from a cryptographic source. It is deliberately NOT
 *   sequential and not derived from anything: nobody — least of all the person
 *   who collected the sample — can predict or recognise which number a sample
 *   will receive. That is what keeps the analysis blind and the results
 *   impossible to target (client requirement, 2026-07-28 / 2026-08-18).
 */

/** Field reference, created by the préleveur. */
export async function generateSampleCode() {
  const year = new Date().getFullYear();
  const prefix = `QL-${year}-`;

  const last = await prisma.sample.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });

  const next = last ? parseInt(last.code.split("-")[2] ?? "0", 10) + 1 : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

/** Official traceable number — sequential within the year. */
async function generateControlCode() {
  const year = new Date().getFullYear();
  const prefix = `QLC-${year}-`;

  const last = await prisma.sample.findFirst({
    where: { controlCode: { startsWith: prefix } },
    orderBy: { controlCode: "desc" },
    select: { controlCode: true },
  });

  const next = last?.controlCode
    ? parseInt(last.controlCode.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

/**
 * Crockford-style alphabet: no I, L, O or U, so a number read off a label can
 * never be transcribed wrongly (1/I, 0/O) and no word can form by accident.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomToken(length: number) {
  let token = "";
  for (let i = 0; i < length; i += 1) {
    token += ALPHABET[randomInt(ALPHABET.length)];
  }
  return token;
}

/** Blind analysis number — unpredictable by construction. */
async function generateSerialNumber() {
  // 32^8 ≈ 1.1e12 possibilities; a collision is already improbable, and the
  // unique constraint is the final guard. Retry rather than fail on one.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const serialNumber = `SN-${randomToken(4)}-${randomToken(4)}`;
    const taken = await prisma.sample.findUnique({
      where: { serialNumber },
      select: { id: true },
    });
    if (!taken) return serialNumber;
  }
  throw new Error("Impossible de générer un numéro de série unique.");
}

export type ReceptionNumbers = {
  controlCode: string;
  serialNumber: string;
};

/** The pair assigned when a sample is received at the laboratory. */
export async function generateReceptionNumbers(): Promise<ReceptionNumbers> {
  return {
    controlCode: await generateControlCode(),
    serialNumber: await generateSerialNumber(),
  };
}
