import type { TranscribeConnectionParams } from "@/transcribe/types";
import { TranscribeModel } from "@/transcribe/keys";

/**
 * Builds a WebSocket URL with all required query parameters
 * @param params - Connection parameters for the transcription service
 * @returns Complete WebSocket URL with query parameters
 */
export function buildWebSocketUrl(params: TranscribeConnectionParams): URL {
  const url = new URL(params.base_url);

  // Add required parameters
  url.searchParams.set("access_token", params.access_token);
  url.searchParams.set("caller_service", params.caller_service);

  // Add optional parameters if provided, otherwise use defaults
  const model = params.model || TranscribeModel.GOOGLE_SPEECH_TO_TEXT_DEFAULT;
  url.searchParams.set("model", model);

  if (params.caller_ref_id) {
    url.searchParams.set("caller_ref_id", params.caller_ref_id);
  }

  return url;
}
