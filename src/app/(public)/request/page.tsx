import { Snowflake } from "lucide-react";
import { EQUIPMENT_TYPES } from "@/lib/domain/types";
import { getSettings } from "@/lib/services/settings";

export const metadata = { title: "Request service" };

/** The public website form. No login. Posts into the same pipeline as email and SMS. */
export default async function RequestPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const settings = await getSettings();
  const input = "h-11 w-full rounded-lg border border-input bg-background px-3 text-base focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Snowflake className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold">{settings.businessName}</h1>
          <p className="text-sm text-muted-foreground">Request service or a quote. We&apos;ll call you back the same day.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      <form method="post" action="/api/public/request" className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Your name <span className="text-rose-600">*</span>
            </label>
            <input id="name" name="name" required maxLength={120} className={input} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="business" className="mb-1 block text-sm font-medium">
              Business
            </label>
            <input id="business" name="business" maxLength={160} className={input} autoComplete="organization" />
          </div>
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium">
              Phone
            </label>
            <input id="phone" name="phone" type="tel" maxLength={40} className={input} autoComplete="tel" />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input id="email" name="email" type="email" maxLength={160} className={input} autoComplete="email" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="address" className="mb-1 block text-sm font-medium">
              Address
            </label>
            <input id="address" name="address" maxLength={240} className={input} autoComplete="street-address" />
          </div>
          <div>
            <label htmlFor="equipment" className="mb-1 block text-sm font-medium">
              Equipment
            </label>
            <select id="equipment" name="equipment" className={`native ${input}`} defaultValue="">
              <option value="">Not sure</option>
              {EQUIPMENT_TYPES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium">
            <input type="checkbox" name="urgent" className="size-4" /> It&apos;s down right now
          </label>
        </div>
        <div>
          <label htmlFor="message" className="mb-1 block text-sm font-medium">
            What&apos;s going on? <span className="text-rose-600">*</span>
          </label>
          <textarea id="message" name="message" required minLength={5} maxLength={5000} rows={5} className={`${input} h-auto py-2`} placeholder="Walk-in cooler holding 45°F since yesterday morning…" />
        </div>
        <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
          <label>
            Website <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <button type="submit" className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary px-5 text-base font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50">
          Send request
        </button>
        <p className="text-center text-xs text-muted-foreground">Phone or email is required so we can reach you.</p>
      </form>
    </main>
  );
}
