import { describe, it, expect } from "vitest";
import { buildWebSocketUrl } from "./index";
import { TranscribeModel } from "@/transcribe/keys";
import type { TranscribeConnectionParams } from "@/transcribe/types";

describe("buildWebSocketUrl", () => {
  const baseParams: TranscribeConnectionParams = {
    base_url: "wss://example.com/ws/speech",
    access_token: "test-token-123",
    caller_service: "test-service",
  };

  it("should build URL with required parameters", () => {
    const url = buildWebSocketUrl(baseParams);

    expect(url.toString()).toContain("wss://example.com/ws/speech");
    expect(url.searchParams.get("access_token")).toBe("test-token-123");
    expect(url.searchParams.get("caller_service")).toBe("test-service");
    expect(url.searchParams.get("model")).toBe(
      TranscribeModel.GOOGLE_SPEECH_TO_TEXT_DEFAULT
    );
  });

  it("should include caller_ref_id when provided", () => {
    const paramsWithRefId: TranscribeConnectionParams = {
      ...baseParams,
      caller_ref_id: "ref-123",
    };

    const url = buildWebSocketUrl(paramsWithRefId);

    expect(url.searchParams.get("caller_ref_id")).toBe("ref-123");
  });

  it("should use custom model when provided", () => {
    const paramsWithModel: TranscribeConnectionParams = {
      ...baseParams,
      model: "custom-model",
    };

    const url = buildWebSocketUrl(paramsWithModel);

    expect(url.searchParams.get("model")).toBe("custom-model");
  });

  it("should handle all parameters together", () => {
    const fullParams: TranscribeConnectionParams = {
      base_url: "wss://api.example.com/transcribe",
      access_token: "full-token-456",
      caller_service: "full-service",
      caller_ref_id: "full-ref-789",
      model: "advanced-model",
    };

    const url = buildWebSocketUrl(fullParams);

    expect(url.toString()).toContain("wss://api.example.com/transcribe");
    expect(url.searchParams.get("access_token")).toBe("full-token-456");
    expect(url.searchParams.get("caller_service")).toBe("full-service");
    expect(url.searchParams.get("caller_ref_id")).toBe("full-ref-789");
    expect(url.searchParams.get("model")).toBe("advanced-model");
  });

  it("should handle different base URL formats", () => {
    const httpsParams: TranscribeConnectionParams = {
      ...baseParams,
      base_url: "https://example.com/api/ws",
    };

    const url = buildWebSocketUrl(httpsParams);

    expect(url.toString()).toContain("https://example.com/api/ws");
  });

  it("should not include caller_ref_id when not provided", () => {
    const url = buildWebSocketUrl(baseParams);

    expect(url.searchParams.get("caller_ref_id")).toBeNull();
  });

  it("should return a valid URL object", () => {
    const url = buildWebSocketUrl(baseParams);

    expect(url).toBeInstanceOf(URL);
    expect(url.protocol).toBe("wss:");
    expect(url.hostname).toBe("example.com");
    expect(url.pathname).toBe("/ws/speech");
  });
});
