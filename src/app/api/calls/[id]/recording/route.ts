import { api, json } from "@/lib/api";
import { attachRecording } from "@/lib/services/calls";

/** multipart/form-data with an `audio` file from MediaRecorder. */
export const POST = api("view:dialer", async (req, { user, params }) => {
  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) return json({ ok: false, reason: "empty", message: "No audio received. Type what was said instead." }, { status: 400 });
  if (audio.size > 25 * 1024 * 1024) return json({ ok: false, reason: "too_large", message: "Recording is over 25 MB. Type what was said instead." }, { status: 413 });
  const result = await attachRecording(params.id, audio, { actor: user.name, mimeType: audio.type || undefined });
  return json(result, { status: result.ok ? 200 : 422 });
});
