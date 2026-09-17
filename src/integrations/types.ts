/**
 * Every outside system sits behind one of these interfaces. Real implementations switch on
 * when their env keys exist; otherwise the simulated one runs. Both feed the same pipeline,
 * so nothing downstream knows (or cares) which one is active.
 */

export type AdapterKind = "real" | "simulated";

export interface SendResult {
  ok: boolean;
  /** Provider id (Twilio SID, Gmail message id) or a simulated id. */
  id?: string;
  /** What the user would have received — shown in the UI in simulated mode. */
  preview?: string;
  error?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyToMessageId?: string;
}

export interface EmailAdapter {
  name: string;
  kind: AdapterKind;
  send(msg: EmailMessage): Promise<SendResult>;
}

export interface SmsMessage {
  to: string;
  text: string;
}

export interface SmsAdapter {
  name: string;
  kind: AdapterKind;
  send(msg: SmsMessage): Promise<SendResult>;
}

export interface VoiceAdapter {
  name: string;
  kind: AdapterKind;
  /** Place an outbound call from the business number to `to`. */
  placeCall(input: { to: string; callId: string }): Promise<SendResult>;
}

export interface TranscriptionAdapter {
  name: string;
  kind: AdapterKind;
  transcribe(file: File | Blob, opts?: { filename?: string; hint?: string }): Promise<{ text: string | null; error?: string; model?: string }>;
}

export interface AdapterStatus {
  email: { name: string; kind: AdapterKind };
  sms: { name: string; kind: AdapterKind };
  voice: { name: string; kind: AdapterKind };
  transcription: { name: string; kind: AdapterKind };
  llm: { name: string; kind: AdapterKind };
  database: { name: string; kind: AdapterKind };
  recording: { name: string; kind: AdapterKind };
}
