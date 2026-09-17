import type { TranscriptionAdapter } from "../types";

/** No STT available: the dialer asks the user to type notes instead. */
export const simulatedTranscription: TranscriptionAdapter = {
  name: "No transcription (type notes)",
  kind: "simulated",
  async transcribe(_file, opts) {
    return { text: opts?.hint ?? null, error: opts?.hint ? undefined : "Transcription is not configured" };
  },
};
