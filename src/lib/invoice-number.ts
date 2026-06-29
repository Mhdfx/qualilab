import { prisma } from "./prisma";

export async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `FAC-${year}-`;

  const last = await prisma.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
  });

  const next = last ? parseInt(last.number.split("-")[2] ?? "0", 10) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}
