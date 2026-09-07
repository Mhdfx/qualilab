import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/database-url";

/**
 * GO-LIVE: retires the demonstration accounts.
 *
 * The seed creates accounts whose password ("password") is printed on the
 * login page. Hiding the panel (NEXT_PUBLIC_DEMO_MODE=false) is cosmetic —
 * this is what actually closes the door: every demo account is banned and
 * its sessions are revoked. Refuses to run until a real ADMIN exists, so
 * the laboratory can never lock itself out.
 *
 *   docker compose run --rm migrate node node_modules/tsx/dist/cli.mjs prisma/disable-demo-accounts.ts
 */

const DEMO_USERNAMES = [
  "pre1", "recep1", "tech1", "tech2", "valid1",
  "commercial1", "compta1", "admin", "magasin1",
];

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(getMariaDbConfig()) });

async function main() {
  const realAdmins = await prisma.user.count({
    where: { role: "ADMIN", username: { notIn: DEMO_USERNAMES }, banned: { not: true } },
  });
  if (realAdmins === 0) {
    console.error(
      "REFUSÉ : aucun compte administrateur réel n'existe encore. Créez-en un dans /admin/utilisateurs avant de désactiver les comptes de démonstration."
    );
    process.exit(2);
  }

  const demo = await prisma.user.findMany({
    where: { username: { in: DEMO_USERNAMES } },
    select: { id: true, username: true, banned: true },
  });
  const ids = demo.map((user) => user.id);

  const [banned, sessions] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { banned: true, banReason: "Compte de démonstration désactivé à la mise en service." },
    }),
    prisma.session.deleteMany({ where: { userId: { in: ids } } }),
  ]);

  console.log(`Comptes de démonstration désactivés : ${banned.count} (sessions révoquées : ${sessions.count})`);
  for (const user of demo) console.log(`  - ${user.username}`);
  console.log("Pensez à NEXT_PUBLIC_DEMO_MODE=false dans .env puis `docker compose up -d --build`.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
