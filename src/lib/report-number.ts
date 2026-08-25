import { prisma } from "./prisma";

/** Official analysis report number — sequential within the year. */
export async function generateReportNumber() {
  const year = new Date().getFullYear();
  const prefix = `RAP-${year}-`;

  const last = await prisma.report.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const next = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}
