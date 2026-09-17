import { api, json } from "@/lib/api";
import { recentCalls } from "@/lib/services/calls";

export const GET = api("view:dialer", async () => json({ calls: await recentCalls(15) }));
