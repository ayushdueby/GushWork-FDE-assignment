import { CheckCircle2 } from "lucide-react";
import { getSettings } from "@/lib/services/settings";

export const metadata = { title: "Thanks" };

export default async function ThanksPage() {
  const settings = await getSettings();
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <CheckCircle2 className="size-12 text-emerald-600" />
      <h1 className="mt-4 text-2xl font-bold">Got it — thank you.</h1>
      <p className="mt-2 text-muted-foreground">
        Your request is on {settings.ownerName}&apos;s call list. If your equipment is down, call {settings.ownerPhone} for the fastest response.
      </p>
      <a href="/request" className="mt-6 text-sm text-primary underline">
        Send another request
      </a>
    </main>
  );
}
