import { db } from "@/lib/db";

export interface AppSettings {
  businessName: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  /** Apply call-transcript updates without review. */
  autoApplyCalls: boolean;
  taxRate: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  businessName: "Denise's Commercial Refrigeration",
  ownerName: "Denise",
  ownerPhone: "(512) 555-0100",
  ownerEmail: "denise@example.com",
  autoApplyCalls: false,
  taxRate: 8.25,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.setting.findMany();
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key === "autoApplyCalls") out.autoApplyCalls = r.value === "1";
    else if (r.key === "taxRate") out.taxRate = Number(r.value) || 0;
    else if (r.key in out) (out as unknown as Record<string, string>)[r.key] = r.value;
  }
  return out;
}

export async function setSetting(key: keyof AppSettings, value: string | number | boolean) {
  const v = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
  await db.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v } });
}
