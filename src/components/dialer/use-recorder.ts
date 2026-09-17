"use client";

import { useCallback, useRef, useState } from "react";

export type MicState = "idle" | "requesting" | "recording" | "denied" | "unavailable" | "error";

/** Browser microphone → MediaRecorder → Blob. Handles permission denied and no-device cases. */
export function useRecorder() {
  const [mic, setMic] = useState<MicState>("idle");
  const [muted, setMuted] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMic("unavailable");
      return false;
    }
    setMic("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      r.start(1000);
      rec.current = r;
      setMuted(false);
      setMic("recording");
      return true;
    } catch (err) {
      const name = (err as { name?: string })?.name;
      setMic(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "unavailable" : "error");
      return false;
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const r = rec.current;
      const s = stream.current;
      const finish = () => {
        s?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        rec.current = null;
        const type = r?.mimeType || "audio/webm";
        const blob = chunks.current.length ? new Blob(chunks.current, { type }) : null;
        chunks.current = [];
        setMic("idle");
        resolve(blob);
      };
      if (!r || r.state === "inactive") return finish();
      r.onstop = finish;
      try {
        r.stop();
      } catch {
        finish();
      }
    });
  }, []);

  const toggleMute = useCallback(() => {
    const s = stream.current;
    if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  return { mic, muted, start, stop, toggleMute };
}
