import type { VoiceAdapter } from "../types";
import { simulatedVoice } from "./simulated";
import { twilioVoice, twilioVoiceConfigured } from "./twilio";

export function voiceAdapter(): VoiceAdapter {
  return twilioVoiceConfigured() ? twilioVoice : simulatedVoice;
}
