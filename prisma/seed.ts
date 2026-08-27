import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/database-url";
import { auth, internalEmailFor } from "../src/lib/auth-server";

const adapter = new PrismaMariaDb(getMariaDbConfig());
const prisma = new PrismaClient({ adapter });

/** Demo accounts — one per role. Password for all: "password". */
const demoUsers = [
  { username: "pre1", name: "Karim Benali", role: "PRELEVEUR" },
  { username: "recep1", name: "Salma Idrissi", role: "RECEPTIONNISTE" },
  { username: "tech1", name: "Yassine Amrani", role: "TECHNICIEN" },
  { username: "tech2", name: "Imane Cherkaoui", role: "TECHNICIEN" },
  { username: "valid1", name: "Dr. Nawal Bennani", role: "VALIDATEUR" },
  { username: "commercial1", name: "Hicham Tazi", role: "GESTIONNAIRE" },
  { username: "compta1", name: "Leila Fassi", role: "COMPTABLE" },
  { username: "admin", name: "Sara Mansouri", role: "ADMIN" },
  { username: "magasin1", name: "Omar Benjelloun", role: "MAGASINIER" },
] as const;

/**
 * Creates the demo accounts.
 *
 * Public sign-up is disabled (accounts are provisioned by the admin), so the
 * seed goes through Better Auth's own context to hash the password exactly as
 * the runtime does — the credentials live in the Account table, never here.
 */
async function seedUsers() {
  const ctx = await auth.$context;
  const created: Record<string, string> = {};

  for (const user of demoUsers) {
    const record = await prisma.user.create({
      data: {
        name: user.name,
        email: internalEmailFor(user.username),
        emailVerified: true,
        username: user.username,
        displayUsername: user.username,
        role: user.role,
      },
      select: { id: true },
    });

    await prisma.account.create({
      data: {
        accountId: record.id,
        providerId: "credential",
        userId: record.id,
        password: await ctx.password.hash("password"),
      },
    });

    created[user.role] = record.id;
    console.log(`  user: ${user.username.padEnd(12)} (${user.role})`);
  }

  return created;
}

/**
 * Analysis parameters with their units and reference limits.
 *
 * ⚠️ PROVISIONAL VALUES. The laboratory will supply its official methods and
 * limits mid-project (client, 2026-08-18); until then these follow the usual
 * Moroccan (NM) microbiological criteria and must be treated as defaults, not
 * as regulatory truth. The one confirmed figure is E. coli in food at
 * 1.10² UFC/g, taken from the client's own alert email of 2026-08-17.
 *
 * `alertOnExceed` marks the sensitive germs the client wants alerts on:
 * E. coli, Salmonelles and Listeria monocytogenes.
 */
const parameters = [
  // Alimentaire
  { name: "Salmonelles", category: "ALIMENTAIRE" as const, unit: "/25 g", threshold: "Absence /25 g", limitValue: 0, alertOnExceed: true },
  { name: "Listeria", category: "ALIMENTAIRE" as const, unit: "UFC/g", threshold: "Absence /25 g", limitValue: 0, alertOnExceed: true },
  { name: "E. coli", category: "ALIMENTAIRE" as const, unit: "UFC/g", threshold: "1.10² UFC/g", limitValue: 100, alertOnExceed: true },
  { name: "Coliformes totaux", category: "ALIMENTAIRE" as const, unit: "UFC/g", threshold: "1.10³ UFC/g", limitValue: 1000, alertOnExceed: false },
  { name: "Levures & moisissures", category: "ALIMENTAIRE" as const, unit: "UFC/g", threshold: "1.10⁴ UFC/g", limitValue: 10000, alertOnExceed: false },
  // Eau
  { name: "Coliformes totaux", category: "EAU" as const, unit: "UFC/100 mL", threshold: "Absence /100 mL", limitValue: 0, alertOnExceed: false },
  { name: "E. coli", category: "EAU" as const, unit: "UFC/100 mL", threshold: "Absence /100 mL", limitValue: 0, alertOnExceed: true },
  { name: "Entérocoques", category: "EAU" as const, unit: "UFC/100 mL", threshold: "Absence /100 mL", limitValue: 0, alertOnExceed: false },
  { name: "Pseudomonas aeruginosa", category: "EAU" as const, unit: "UFC/100 mL", threshold: "Absence /100 mL", limitValue: 0, alertOnExceed: false },
  { name: "Flore totale", category: "EAU" as const, unit: "UFC/mL", threshold: "1.10² UFC/mL", limitValue: 100, alertOnExceed: false },
  // Ambiance
  { name: "Flore totale surfaces", category: "AMBIANCE" as const, unit: "UFC/cm²", threshold: "1.10¹ UFC/cm²", limitValue: 10, alertOnExceed: false },
  { name: "Coliformes", category: "AMBIANCE" as const, unit: "UFC/cm²", threshold: "Absence /cm²", limitValue: 0, alertOnExceed: false },
  { name: "Staphylocoques", category: "AMBIANCE" as const, unit: "UFC/cm²", threshold: "Absence /cm²", limitValue: 0, alertOnExceed: false },
  { name: "Levures", category: "AMBIANCE" as const, unit: "UFC/cm²", threshold: "1.10¹ UFC/cm²", limitValue: 10, alertOnExceed: false },
  { name: "Salmonelles surfaces", category: "AMBIANCE" as const, unit: "/cm²", threshold: "Absence", limitValue: 0, alertOnExceed: true },
];

const labServices = [
  { name: "Salmonelles", category: "ALIMENTAIRE", unitPrice: 450 },
  { name: "Listeria monocytogenes", category: "ALIMENTAIRE", unitPrice: 480 },
  { name: "E. coli", category: "ALIMENTAIRE", unitPrice: 320 },
  { name: "Coliformes totaux", category: "ALIMENTAIRE", unitPrice: 280 },
  { name: "Levures & moisissures", category: "ALIMENTAIRE", unitPrice: 260 },
  { name: "Coliformes totaux", category: "EAU", unitPrice: 280 },
  { name: "E. coli", category: "EAU", unitPrice: 320 },
  { name: "Entérocoques", category: "EAU", unitPrice: 340 },
  { name: "Pseudomonas aeruginosa", category: "EAU", unitPrice: 380 },
  { name: "Flore totale", category: "EAU", unitPrice: 220 },
  { name: "Légionelles", category: "EAU", unitPrice: 420 },
  { name: "Flore totale surfaces", category: "AMBIANCE", unitPrice: 240 },
  { name: "Coliformes", category: "AMBIANCE", unitPrice: 260 },
  { name: "Staphylocoques", category: "AMBIANCE", unitPrice: 270 },
  { name: "Levures", category: "AMBIANCE", unitPrice: 230 },
  { name: "Salmonelles surfaces", category: "AMBIANCE", unitPrice: 450 },
  { name: "Prélèvement sur site & transport", category: "PRESTATION", unitPrice: 250 },
  { name: "Rapport d'analyse certifié", category: "PRESTATION", unitPrice: 150 },
  { name: "Intervention urgente (< 24 h)", category: "PRESTATION", unitPrice: 350 },
];

function serviceId(category: string, name: string) {
  return `${category}-${name}`.replace(/\s+/g, "-").toLowerCase();
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.clientEmail.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.report.deleteMany();
  await prisma.result.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.sampleParameter.deleteMany();
  await prisma.sample.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  console.log("Seeding users (one per role)...");
  const users = await seedUsers();
  const preleveur = { id: users.PRELEVEUR };
  const admin = { id: users.ADMIN };

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

  // Each client receives mail at several addresses (client request 2026-08-17):
  // the quality contact plus, for some, a management address in copy.
  for (const client of clients) {
    const [local, domain] = (client.email ?? "").split("@");
    if (!local || !domain) continue;
    await prisma.clientEmail.createMany({
      data: [
        { clientId: client.id, email: client.email!, label: "Contact qualité", forReports: true, forAlerts: true },
        { clientId: client.id, email: `direction@${domain}`, label: "Direction", forReports: false, forAlerts: true },
      ],
      skipDuplicates: true,
    });
  }

  for (const param of parameters) {
    await prisma.analysisParameter.upsert({
      where: { id: `${param.category}-${param.name}` },
      update: param,
      create: { id: `${param.category}-${param.name}`, ...param },
    });
  }

  for (const service of labServices) {
    const id = serviceId(service.category, service.name);
    await prisma.labService.upsert({
      where: { id },
      update: service,
      create: { id, ...service },
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
    { description: "Salmonelles", quantity: 1, unitPrice: 450 },
    { description: "Listeria monocytogenes", quantity: 1, unitPrice: 480 },
    { description: "E. coli", quantity: 2, unitPrice: 320 },
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

  const invoice2Items = [{ description: "Salmonelles", quantity: 1, unitPrice: 450 }];
  const invoice2ItemsWithTotals = invoice2Items.map((item) => ({
    ...item,
    lineTotal: Math.round(item.quantity * item.unitPrice * 100) / 100,
  }));
  const subtotal2 =
    Math.round(invoice2ItemsWithTotals.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  const taxAmount2 = Math.round(subtotal2 * (taxRate / 100) * 100) / 100;
  const total2 = Math.round((subtotal2 + taxAmount2) * 100) / 100;

  await prisma.invoice.create({
    data: {
      number: `FAC-${year}-0002`,
      clientId: client.id,
      createdById: admin.id,
      status: "EN_ATTENTE",
      issueDate: new Date(),
      taxRate,
      subtotal: subtotal2,
      taxAmount: taxAmount2,
      total: total2,
      items: { create: invoice2ItemsWithTotals },
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
