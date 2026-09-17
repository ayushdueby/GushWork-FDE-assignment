import fs from "node:fs/promises";
import { api } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = api("view:dialer", async (_req, { params }) => {
  const call = await db.call.findUnique({ where: { id: params.id } });
  if (!call?.recordingPath || call.recordingPath.startsWith("ext:") || call.recordingPath.startsWith("http")) return new Response("No recording", { status: 404 });
  try {
    const buf = await fs.readFile(call.recordingPath);
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": call.recordingMime ?? "audio/webm", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Recording not available on this server", { status: 404 });
  }
});
