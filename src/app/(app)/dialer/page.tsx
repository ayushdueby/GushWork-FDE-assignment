import { DialerPanel } from "@/components/dialer/dialer-panel";
import { AutoApplyToggle } from "@/components/dialer/auto-apply-toggle";
import { requirePage } from "@/lib/auth/current";
import { getSettings } from "@/lib/services/settings";
import { adapterStatus } from "@/integrations";

export const metadata = { title: "Dialer" };

export default async function DialerPage({ searchParams }: { searchParams: Promise<{ review?: string; number?: string }> }) {
  await requirePage("view:dialer");
  const sp = await searchParams;
  const [settings, status] = await Promise.all([getSettings(), Promise.resolve(adapterStatus())]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dialer</h1>
          <p className="text-sm text-muted-foreground">
            Line: {status.voice.name} · Transcription: {status.transcription.name}. Every call becomes a summary and a set of proposed job updates.
          </p>
        </div>
        <AutoApplyToggle enabled={settings.autoApplyCalls} />
      </header>
      <DialerPanel inline reviewCallId={sp.review ?? null} />
    </div>
  );
}
