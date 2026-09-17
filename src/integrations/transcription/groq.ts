import { transcribeAudio } from "@/lib/ai/groq";
import type { TranscriptionAdapter } from "../types";

export const groqTranscription: TranscriptionAdapter = {
  name: "Groq Whisper",
  kind: "real",
  async transcribe(file, opts) {
    const r = await transcribeAudio(file, { filename: opts?.filename, mock: opts?.hint });
    return { text: r.text, error: r.error, model: r.model };
  },
};
