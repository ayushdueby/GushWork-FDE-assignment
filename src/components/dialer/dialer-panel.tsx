"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Mic, MicOff, Phone, PhoneIncoming, PhoneMissed, PhoneOff, Play, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone, phoneDigits } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/rules/dates";
import { cn } from "@/lib/utils";
import { CallReview, type ReviewData } from "./call-review";
import { useDialer } from "./dialer-provider";
import { useRecorder } from "./use-recorder";

type Phase = "idle" | "ringing" | "in_call" | "processing" | "review" | "notes";

interface Match {
  id: string;
  businessName: string;
  primaryContact: string;
  phone: string | null;
  job: { id: string; stage: string; issue: string; urgent: boolean } | null;
}
interface RecentCall {
  id: string;
  direction: string;
  number: string;
  status: string;
  startedAt: string;
  durationSec: number;
  applied: boolean;
  summary: string | null;
  customer: { id: string; businessName: string } | null;
  job: { id: string; stage: string } | null;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const SAMPLES = [
  { key: "urgent-with-price", label: "New urgent request (price mentioned)" },
  { key: "approve-quote", label: "Customer approving a quote" },
  { key: "pick-a-date", label: "Customer picking a date" },
];
const INBOUND_SAMPLE_NUMBERS = [
  { number: "(512) 555-0199", label: "Rosa's Taqueria (known)" },
  { number: "(512) 555-0134", label: "Big Sky Grocery (known)" },
  { number: "(512) 555-0842", label: "Unknown number" },
];

export function DialerPanel({ inline = false, reviewCallId }: { inline?: boolean; reviewCallId?: string | null }) {
  const dialer = useDialer();
  const router = useRouter();
  const recorder = useRecorder();
  const [phase, setPhase] = useState<Phase>("idle");
  const [number, setNumber] = useState(() => dialer.target?.number ?? "");
  const [label, setLabel] = useState<string | null>(() => dialer.target?.label ?? null);
  const [jobId, setJobId] = useState<string | null>(() => dialer.target?.jobId ?? null);
  const [customerId, setCustomerId] = useState<string | null>(() => dialer.target?.customerId ?? null);
  const [seenTarget, setSeenTarget] = useState(dialer.target);
  const [matches, setMatches] = useState<Match[]>([]);
  const [recent, setRecent] = useState<RecentCall[]>([]);
  const [callId, setCallId] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [notesPrompt, setNotesPrompt] = useState<string | null>(null);
  const [ringing, setRinging] = useState<{ number: string; customer: { id: string; businessName: string } | null; job: { id: string; stage: string; issue: string; urgent: boolean } | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef<number>(0);

  // Prefill from a Call button anywhere in the app (state derived during render, no effect).
  if (dialer.target !== seenTarget) {
    setSeenTarget(dialer.target);
    if (dialer.target && phase === "idle") {
      setNumber(dialer.target.number);
      setLabel(dialer.target.label ?? null);
      setJobId(dialer.target.jobId ?? null);
      setCustomerId(dialer.target.customerId ?? null);
    }
  }

  const loadRecent = useCallback(() => {
    fetch("/api/calls/recent")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRecent(d.calls ?? []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  // Open straight into a review (job page "Review proposed changes" link).
  useEffect(() => {
    if (!reviewCallId) return;
    fetch(`/api/calls/${reviewCallId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.call) return;
        setReview({ callId: d.call.id, jobId: d.call.job?.id ?? null, transcript: d.call.transcript ?? "", extraction: d.extraction ?? { summary: d.call.summary ?? "", issue: null, equipment: null, urgency: null, quoteAmount: null, decision: null, requestedDate: null, nextStep: null }, changes: d.changes ?? [], engine: d.extraction?.engine, alreadyApplied: d.call.applied });
        setPhase("review");
      })
      .catch(() => {});
  }, [reviewCallId]);

  // Contact lookup as you type.
  useEffect(() => {
    const d = phoneDigits(number);
    const t = setTimeout(() => {
      if (d.length < 3 || phase !== "idle") {
        setMatches([]);
        return;
      }
      fetch(`/api/calls/lookup?digits=${d}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => res && setMatches(res.matches ?? []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [number, phase]);

  function press(k: string) {
    setNumber((n) => (n.replace(/\D/g, "").length >= 15 ? n : n + k));
    setLabel(null);
    setJobId(null);
    setCustomerId(null);
  }

  function startTimer() {
    startedAt.current = Date.now();
    setSeconds(0);
    timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
  }
  function stopTimer() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  async function placeCall() {
    const digits = phoneDigits(number);
    if (digits.length < 7) return toast.error("Enter a phone number first.");
    setBusy(true);
    try {
      const res = await fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number, jobId, customerId }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCallId(json.call.id);
      setJobId(json.call.jobId ?? jobId);
      setCustomerId(json.call.customerId ?? customerId);
      setPhase("in_call");
      startTimer();
      const ok = await recorder.start();
      if (!ok) toast.info("No microphone — you can type notes after the call.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the call");
    } finally {
      setBusy(false);
    }
  }

  async function hangUp() {
    if (!callId) return;
    stopTimer();
    const duration = Math.floor((Date.now() - startedAt.current) / 1000);
    setPhase("processing");
    const blob = await recorder.stop();
    try {
      await fetch(`/api/calls/${callId}/end`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationSec: duration, answered: true }) });
      if (!blob || blob.size < 1500) {
        setNotesPrompt(recorder.mic === "denied" ? "Microphone access was denied, so nothing was recorded. Type what was said:" : "The recording was empty or too short. Type what was said:");
        setPhase("notes");
        return;
      }
      const fd = new FormData();
      fd.set("audio", blob, "call.webm");
      const res = await fetch(`/api/calls/${callId}/recording`, { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        setNotesPrompt(json.message ?? "Transcription failed. Type what was said:");
        setPhase("notes");
        return;
      }
      setReview({ callId, jobId, transcript: json.transcript, extraction: json.extraction, changes: json.changes, engine: json.engine, applied: json.applied });
      setPhase("review");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong after the call");
      setNotesPrompt("Something went wrong. Type what was said:");
      setPhase("notes");
    } finally {
      loadRecent();
    }
  }

  async function submitNotes(text: string) {
    if (!callId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/calls/${callId}/transcript`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setReview({ callId, jobId, transcript: json.transcript, extraction: json.extraction, changes: json.changes, engine: json.engine, applied: json.applied });
      setPhase("review");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save notes");
    } finally {
      setBusy(false);
    }
  }

  async function playSample(key: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/calls/sample", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, jobId: jobId ?? null }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCallId(json.callId);
      setJobId(json.jobId);
      setReview({ callId: json.callId, jobId: json.jobId, transcript: json.transcript, extraction: json.extraction, changes: json.changes, engine: json.engine, applied: json.applied });
      setPhase("review");
      router.refresh();
      loadRecent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sample failed");
    } finally {
      setBusy(false);
    }
  }

  async function simulateInbound(num: string) {
    const res = await fetch(`/api/calls/inbound-sim?number=${encodeURIComponent(num)}`);
    const who = res.ok ? await res.json() : { customer: null, job: null };
    setRinging({ number: num, customer: who.customer, job: who.job });
    setPhase("ringing");
    ringTimer.current = setTimeout(() => declineInbound(num, true), 15_000);
  }

  async function answerInbound() {
    if (!ringing) return;
    if (ringTimer.current) clearTimeout(ringTimer.current);
    setBusy(true);
    try {
      const res = await fetch("/api/calls/inbound-sim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: ringing.number, answered: true }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCallId(json.callId);
      setJobId(json.jobId ?? null);
      setCustomerId(json.customer?.id ?? null);
      setNumber(ringing.number);
      setLabel(json.customer?.businessName ?? null);
      setRinging(null);
      setPhase("in_call");
      startTimer();
      const ok = await recorder.start();
      if (!ok) toast.info("No microphone — you can type notes after the call.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't answer");
    } finally {
      setBusy(false);
    }
  }

  async function declineInbound(num?: string, timedOut = false) {
    const n = num ?? ringing?.number;
    if (!n) return;
    if (ringTimer.current) clearTimeout(ringTimer.current);
    setRinging(null);
    setPhase("idle");
    try {
      const res = await fetch("/api/calls/inbound-sim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ number: n, answered: false }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast.warning(timedOut ? "Missed call — it's at the top of Today." : "Declined — logged as a missed call at the top of Today.", { action: json.jobId ? { label: "Open job", onClick: () => router.push(`/jobs/${json.jobId}`) } : undefined });
      router.refresh();
      loadRecent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't log the missed call");
    }
  }

  function reset() {
    setPhase("idle");
    setReview(null);
    setCallId(null);
    setNotesPrompt(null);
    setSeconds(0);
    loadRecent();
    if (!inline && reviewCallId) router.replace("/dialer");
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className={cn("flex flex-col gap-4", inline ? "" : "h-full")} data-testid="dialer" data-phase={phase}>
      {phase === "ringing" && ringing && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center" role="alert" aria-live="assertive">
          <PhoneIncoming className="mx-auto size-8 animate-bounce text-emerald-700" />
          <p className="mt-2 text-sm text-emerald-800">Incoming call</p>
          <p className="text-xl font-bold">{ringing.customer?.businessName ?? "Unknown caller"}</p>
          <p className="text-muted-foreground">{formatPhone(ringing.number)}</p>
          {ringing.job && (
            <p className="mt-1 text-sm text-emerald-900">
              Open job: {ringing.job.issue.slice(0, 60)} · {ringing.job.stage.replace(/_/g, " ")}
              {ringing.job.urgent && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold uppercase text-white">urgent</span>}
            </p>
          )}
          <div className="mt-4 flex justify-center gap-3">
            <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700" onClick={answerInbound} disabled={busy} data-testid="answer-call">
              <Phone /> Answer
            </Button>
            <Button size="lg" variant="destructive" onClick={() => declineInbound()} data-testid="decline-call">
              <PhoneMissed /> Decline
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">No answer in 15 seconds = missed call → lead on Today.</p>
        </div>
      )}

      {(phase === "idle" || phase === "in_call") && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-center">
            {label && <p className="text-sm font-medium text-muted-foreground">{label}</p>}
            <div className="relative">
              <input
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value);
                  setLabel(null);
                  setJobId(null);
                  setCustomerId(null);
                }}
                inputMode="tel"
                placeholder="Enter a number"
                aria-label="Phone number"
                disabled={phase === "in_call"}
                className="h-14 w-full rounded-lg bg-transparent text-center text-3xl font-semibold tracking-wide outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-100"
                data-testid="dial-number"
              />
              {phase === "idle" && number && (
                <button type="button" onClick={() => setNumber((n) => n.slice(0, -1))} aria-label="Delete last digit" className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted">
                  <Delete className="size-5" />
                </button>
              )}
            </div>
            {phase === "in_call" && (
              <p className="mt-1 flex items-center justify-center gap-3 text-sm">
                <span className="tabular-nums" aria-live="polite">
                  {mm}:{ss}
                </span>
                {recorder.mic === "recording" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700" data-testid="recording-indicator">
                    <span className="size-2 animate-pulse rounded-full bg-red-600" /> Recording
                  </span>
                ) : recorder.mic === "requesting" ? (
                  <span className="text-xs text-muted-foreground">Asking for microphone…</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not recording ({recorder.mic === "denied" ? "mic denied" : "no mic"})</span>
                )}
              </p>
            )}
          </div>

          {phase === "idle" && matches.length > 0 && (
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border" aria-label="Matching customers">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setNumber(m.phone ?? number);
                      setLabel(m.businessName);
                      setCustomerId(m.id);
                      setJobId(m.job?.id ?? null);
                      setMatches([]);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <User className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {m.businessName} <span className="font-normal text-muted-foreground">{m.primaryContact}</span>
                      </span>
                      {m.job && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {m.job.urgent && <span className="mr-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold uppercase text-white">urgent</span>}
                          {m.job.stage.replace(/_/g, " ")} · {m.job.issue}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatPhone(m.phone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {phase === "idle" && (
            <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 gap-2" role="group" aria-label="Keypad">
              {KEYS.map((k) => (
                <button key={k} type="button" onClick={() => press(k)} className="h-14 rounded-xl bg-muted text-xl font-semibold hover:bg-muted/70 active:bg-muted/50" aria-label={`Key ${k}`} data-testid={`key-${k}`}>
                  {k}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-center gap-3">
            {phase === "idle" ? (
              <Button size="lg" className="w-44 bg-emerald-600 hover:bg-emerald-700" onClick={placeCall} disabled={busy || phoneDigits(number).length < 7} data-testid="place-call">
                <Phone /> Call
              </Button>
            ) : (
              <>
                <Button size="lg" variant="outline" onClick={recorder.toggleMute} aria-pressed={recorder.muted} disabled={recorder.mic !== "recording"}>
                  {recorder.muted ? <MicOff /> : <Mic />} {recorder.muted ? "Unmute" : "Mute"}
                </Button>
                <Button size="lg" variant="destructive" className="w-40 bg-red-600 text-white hover:bg-red-700" onClick={hangUp} data-testid="hang-up">
                  <PhoneOff /> Hang up
                </Button>
              </>
            )}
          </div>
          {phase === "in_call" && (
            <p className="mt-3 text-center text-xs text-muted-foreground">Outbound telephony is simulated: talk into your mic as if on the call. On hang-up we transcribe it and propose job updates.</p>
          )}
        </div>
      )}

      {phase === "processing" && (
        <div className="rounded-2xl border border-border bg-card p-6 text-center" aria-live="polite">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-3 font-medium">Transcribing the call…</p>
          <p className="text-sm text-muted-foreground">Groq Whisper, then extraction. Usually a few seconds.</p>
        </div>
      )}

      {phase === "notes" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-amber-900">{notesPrompt}</p>
          <form
            className="mt-2 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const text = String(new FormData(e.currentTarget).get("text") ?? "").trim();
              if (text.length < 3) return toast.error("Add a few words about the call.");
              submitNotes(text);
            }}
          >
            <Textarea name="text" rows={4} placeholder="Rosa says the walk-in freezer is down, quoted around $1,800, wants someone today." data-testid="call-notes" />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save notes"}
              </Button>
              <Button type="button" variant="outline" onClick={reset}>
                Skip
              </Button>
            </div>
          </form>
        </div>
      )}

      {phase === "review" && review && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Call summary</h3>
            <Button variant="ghost" size="sm" onClick={reset}>
              Done
            </Button>
          </div>
          <CallReview data={review} onDone={reset} />
        </div>
      )}

      {phase === "idle" && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-dashed border-border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Play className="size-4" /> Play sample call
              </p>
              <div className="flex flex-col gap-1.5">
                {SAMPLES.map((s) => (
                  <Button key={s.key} variant="outline" size="sm" className="justify-start" onClick={() => playSample(s.key)} disabled={busy} data-testid={`sample-call-${s.key}`}>
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-dashed border-border p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <PhoneIncoming className="size-4" /> Simulate incoming call
              </p>
              <div className="flex flex-col gap-1.5">
                {INBOUND_SAMPLE_NUMBERS.map((s) => (
                  <Button key={s.number} variant="outline" size="sm" className="justify-start" onClick={() => simulateInbound(s.number)} disabled={busy} data-testid={`inbound-${phoneDigits(s.number)}`}>
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <p className="border-b border-border px-3 py-2 text-sm font-semibold">Recent calls</p>
            <ul className="max-h-64 divide-y divide-border overflow-auto">
              {recent.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">No calls yet.</li>}
              {recent.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  {c.status === "missed" ? <PhoneMissed className="size-4 text-red-600" /> : c.direction === "inbound" ? <PhoneIncoming className="size-4 text-muted-foreground" /> : <Phone className="size-4 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.customer?.businessName ?? formatPhone(c.number)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatTimestamp(c.startedAt)}
                      {c.status !== "missed" && ` · ${Math.max(1, Math.round(c.durationSec / 60))} min`}
                      {c.summary && ` · ${c.summary}`}
                    </span>
                  </span>
                  {c.job && !c.applied && c.summary && (
                    <Link href={`/dialer?review=${c.id}`} className="text-xs text-primary underline">
                      Review
                    </Link>
                  )}
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-lg hover:bg-muted"
                    aria-label={`Call back ${c.customer?.businessName ?? c.number}`}
                    onClick={() => {
                      setNumber(c.number);
                      setLabel(c.customer?.businessName ?? null);
                      setCustomerId(c.customer?.id ?? null);
                      setJobId(c.job?.id ?? null);
                    }}
                  >
                    <Phone className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
