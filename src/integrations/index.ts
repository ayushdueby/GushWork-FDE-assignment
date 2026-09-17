import { groqEnabled, groqMocked } from "@/lib/ai/groq";
import { emailAdapter } from "./email";
import { smsAdapter } from "./sms";
import { transcriptionAdapter } from "./transcription";
import type { AdapterStatus } from "./types";
import { voiceAdapter } from "./voice";

/** For the "Demo mode" banner: what's real, what's simulated. */
export function adapterStatus(): AdapterStatus {
  const email = emailAdapter();
  const sms = smsAdapter();
  const voice = voiceAdapter();
  const stt = transcriptionAdapter();
  const url = process.env.DATABASE_URL ?? "";
  return {
    email: { name: email.name, kind: email.kind },
    sms: { name: sms.name, kind: sms.kind },
    voice: { name: voice.name, kind: voice.kind },
    transcription: { name: stt.name, kind: stt.kind },
    llm: { name: groqMocked() ? "Groq (mocked for tests)" : groqEnabled() ? "Groq LLM" : "Rule-based fallback", kind: groqEnabled() && !groqMocked() ? "real" : "simulated" },
    database: { name: /^postgres/i.test(url) ? "Postgres (Neon)" : "SQLite", kind: "real" },
    recording: { name: "Browser microphone", kind: "real" },
  };
}

export { emailAdapter, smsAdapter, voiceAdapter, transcriptionAdapter };
