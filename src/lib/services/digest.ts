import { formatPhone } from "@/lib/domain/types";
import { daysAgoLabel, formatLongDate } from "@/lib/rules/dates";
import { buildCallList, kpis } from "./today";
import { getSettings } from "./settings";
import { sendOutbound } from "./messaging";

/** The 7am "who to call" list as a text message / email body. */
export async function buildDigest(now = new Date()): Promise<{ subject: string; text: string; count: number }> {
  const [items, k, settings] = await Promise.all([buildCallList(now), kpis(now), getSettings()]);
  const lines: string[] = [];
  lines.push(`Good morning ${settings.ownerName} — ${formatLongDate(now)}`);
  lines.push(`${k.openJobs} open jobs · ${items.length} to call today · $${Math.round(k.waitingOnYesTotal).toLocaleString()} waiting on a yes`);
  lines.push("");
  if (items.length === 0) lines.push("Nobody waiting on you. Nice.");
  for (const [i, it] of items.entries()) {
    const c = it.job.customer;
    lines.push(`${i + 1}. ${it.critical ? "🔴 " : ""}${c.businessName}${c.primaryContact ? ` (${c.primaryContact})` : ""} — ${it.reason}`);
    lines.push(`   ${formatPhone(c.phone) || "no phone"} · ${it.job.equipmentType} · waiting ${daysAgoLabel(it.waitingDays)}`);
  }
  lines.push("");
  lines.push(`Open the list: ${process.env.APP_URL ?? "http://localhost:3000"}/`);
  return { subject: `Call list for ${formatLongDate(now)} — ${items.length} to call`, text: lines.join("\n"), count: items.length };
}

export async function sendDigest(channel: "sms" | "email", actor: string) {
  const settings = await getSettings();
  const d = await buildDigest();
  const to = channel === "sms" ? settings.ownerPhone : settings.ownerEmail;
  const sent = await sendOutbound({ channel, to, subject: d.subject, text: d.text, actor, contact: false });
  return { ...d, to, preview: sent.result.preview ?? d.text, simulated: sent.simulated, ok: sent.result.ok, error: sent.result.error };
}
