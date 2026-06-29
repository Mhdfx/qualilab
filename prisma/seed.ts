import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/database-url";
import bcrypt from "bcryptjs";

const adapter = new PrismaMariaDb(getMariaDbConfig());
const prisma = new PrismaClient({ adapter });

const parameters = [
  { name: "Salmonelles", category: "ALIMENTAIRE" as const },
  { name: "Listeria", category: "ALIMENTAIRE" as const },
  { name: "E. coli", category: "ALIMENTAIRE" as const },
  { name: "Coliformes totaux", category: "ALIMENTAIRE" as const },
  { name: "Levures & moisissures", category: "ALIMENTAIRE" as const },
  { name: "Coliformes totaux", category: "EAU" as const },
  { name: "E. coli", category: "EAU" as const },
  { name: "Entérocoques", category: "EAU" as const },
  { name: "Pseudomonas aeruginosa", category: "EAU" as const },
  { name: "Flore totale", category: "EAU" as const },
  { name: "Flore totale surfaces", category: "AMBIANCE" as const },
  { name: "Coliformes", category: "AMBIANCE" as const },
  { name: "Staphylocoques", category: "AMBIANCE" as const },
  { name: "Levures", category: "AMBIANCE" as const },
  { name: "Salmonelles surfaces", category: "AMBIANCE" as const },
];

async function main() {
  const passwordHash = await bcrypt.hash("password", 10);

  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.sampleParameter.deleteMany();
  await prisma.sample.deleteMany();
  await prisma.user.deleteMany();

  const preleveur = await prisma.user.create({
    data: {
      username: "pre1",
      name: "Karim Benali",
      password: passwordHash,
      role: "PRELEVEUR",
    },
  });

  const admin = await prisma.user.create({
    data: {
      username: "admin",
      name: "Sara Mansouri",
      password: passwordHash,
      role: "ADMIN",
    },
  });

  const clientsData = [
    { name: "Restaurant Le Palmier", contact: "Ahmed B.", email: "contact@lepalmier.ma", phone: "06 12 34 56 78", address: "12 Rue des Oliviers, Casablanca", ice: "001234567000045" },
    { name: "Station d'eau Atlas", contact: "Fatima Z.", email: "labo@atlas-eau.ma", phone: "05 22 11 22 33", address: "Zone Industrielle Sud, Marrakech", ice: "001234567000046" },
    { name: "Usine AgroMaroc", contact: "Youssef K.", email: "qualite@agromaroc.ma", phone: "05 37 44 55 66", address: "Lot 45, Quartier Industriel, Rabat", ice: "001234567000047" },
    { name: "Hôtel Riviera", contact: "Nadia R.", email: "hygiene@riviera.ma", phone: "05 24 88 99 00", address: "Avenue de la Corniche, Agadir", ice: "001234567000048" },
    { name: "Boulangerie du Centre", contact: "Omar T.", email: "boulangerie@centre.ma", phone: "06 98 76 54 32", address: "8 Place du Marché, Fès", ice: "001234567000049" },
  ];

  const clients = [];
  for (const clientData of clientsData) {
    const existing = await prisma.client.findFirst({ where: { name: clientData.name } });
    clients.push(
      existing
        ? await prisma.client.update({ where: { id: existing.id }, data: clientData })
        : await prisma.client.create({ data: clientData })
    );
  }

  for (const param of parameters) {
    await prisma.analysisParameter.upsert({
      where: { id: `${param.category}-${param.name}` },
      update: param,
      create: { id: `${param.category}-${param.name}`, ...param },
    });
  }

  const year = new Date().getFullYear();
  const client = clients[0];
  const params = await prisma.analysisParameter.findMany({
    where: { category: "ALIMENTAIRE" },
    take: 3,
  });

  const sample = await prisma.sample.create({
    data: {
      code: `QL-${year}-00001`,
      clientId: client.id,
      userId: preleveur.id,
      lieu: "Cuisine principale — Restaurant Le Palmier",
      type: "ALIMENTAIRE",
      notes: "Prélèvement effectué avant service du midi.",
      status: "PRELEVE",
      sampledAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.sampleParameter.createMany({
    data: params.map((p) => ({ sampleId: sample.id, parameterId: p.id })),
  });

  const invoiceItems = [
    { description: "Analyse microbiologique — Salmonelles", quantity: 1, unitPrice: 450 },
    { description: "Analyse microbiologique — Listeria monocytogenes", quantity: 1, unitPrice: 480 },
    { description: "Recherche E. coli & coliformes", quantity: 2, unitPrice: 320 },
    { description: "Prélèvement sur site & transport", quantity: 1, unitPrice: 250 },
  ];
  const invoiceItemsWithTotals = invoiceItems.map((item) => ({
    ...item,
    lineTotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
  }));
  const subtotal =
    Math.round(invoiceItemsWithTotals.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  const taxRate = 20;
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  await prisma.invoice.create({
    data: {
      number: `FAC-${year}-0001`,
      clientId: client.id,
      createdById: admin.id,
      status: "EN_ATTENTE",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      notes: "Paiement par virement bancaire sous 30 jours.\nMerci de rappeler le numéro de facture lors du règlement.",
      taxRate,
      subtotal,
      taxAmount,
      total,
      items: { create: invoiceItemsWithTotals },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed.");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
