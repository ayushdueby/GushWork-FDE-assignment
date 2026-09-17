import { api } from "@/lib/api";
import { jobsCsv, parseRange } from "@/lib/services/reports";

export const GET = api("view:reports", async (req) => {
  const u = new URL(req.url);
  const range = parseRange(u.searchParams.get("from"), u.searchParams.get("to"));
  const csv = await jobsCsv(range);
  const name = `jobs-${range.from.toISOString().slice(0, 10)}-to-${new Date(range.to.getTime() - 1).toISOString().slice(0, 10)}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
});
