// Flip the Prisma datasource provider to match DATABASE_URL.
// SQLite for local dev (file:./dev.db), Postgres for production (Neon).
import fs from "node:fs";
import path from "node:path";

const schemaPath = path.resolve("prisma/schema.prisma");
const url = process.env.DATABASE_URL ?? "";
const wantPostgres = /^postgres(ql)?:\/\//i.test(url);
const provider = wantPostgres ? "postgresql" : "sqlite";
const src = fs.readFileSync(schemaPath, "utf8");
const next = src.replace(/provider\s*=\s*"(sqlite|postgresql)"/, `provider = "${provider}"`);
if (next !== src) {
  fs.writeFileSync(schemaPath, next);
  console.log(`[prisma-provider] datasource provider set to ${provider}`);
}
