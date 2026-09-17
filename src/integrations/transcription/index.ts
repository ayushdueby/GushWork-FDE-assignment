import { groqEnabled } from "@/lib/ai/groq";
import type { TranscriptionAdapter } from "../types";
import { groqTranscription } from "./groq";
import { simulatedTranscription } from "./simulated";

export function transcriptionAdapter(): TranscriptionAdapter {
  return groqEnabled() ? groqTranscription : simulatedTranscription;
}
