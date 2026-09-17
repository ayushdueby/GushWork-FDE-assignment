import { PrismaClient } from "@prisma/client";
import { resetAndSeed } from "../src/lib/seed/seed";

const db = new PrismaClient();
resetAndSeed(db)
  .then((r) => {
    console.log("Seeded demo data:", r);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
