import { prisma } from "./prisma";

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
