import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Fresh SQLite schema for the DB-backed unit suites (prisma/test.db is throwaway). */
export default function setup() {
  for (const f of ["test.db", "test.db-journal"]) {
    const p = path.resolve("prisma", f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: { ...process.env, DATABASE_URL: "file:./test.db" } });
}
