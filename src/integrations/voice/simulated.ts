import type { VoiceAdapter, SendResult } from "../types";

/** Outbound telephony is simulated: the browser dialer runs the call UI and records the mic locally. */
export const simulatedVoice: VoiceAdapter = {
  name: "Browser dialer (simulated line)",
  kind: "simulated",
  async placeCall(input): Promise<SendResult> {
    return { ok: true, id: `sim-call-${input.callId}`, preview: `Would dial ${input.to}` };
  },
};
