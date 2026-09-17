import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// Live operational data on every page — never prerender a stale call list.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Cooler Calls", template: "%s · Cooler Calls" },
  description: "Who to call today, and where each job is at.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
