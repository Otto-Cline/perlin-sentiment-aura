import { describe, expect, it } from "vitest";
import {
  MAX_BACKOFF_MS,
  backoffDelay,
  chooseAuth,
  shouldSubmit,
} from "./useTranscription";

describe("chooseAuth", () => {
  it("prefers a minted token so the key never reaches the browser", () => {
    const auth = chooseAuth("jwt-abc", "raw-key");
    expect(auth).toEqual({ protocols: ["bearer", "jwt-abc"], mode: "token" });
  });

  it("falls back to the browser key when no token could be minted", () => {
    // Minting needs a Deepgram key with permission to do so; one without it
    // returns FORBIDDEN. Falling back keeps the demo working.
    const auth = chooseAuth(null, "raw-key");
    expect(auth).toEqual({ protocols: ["token", "raw-key"], mode: "key" });
  });

  it("uses the documented subprotocol name for each credential type", () => {
    // Verified against Deepgram: ["token", KEY] negotiates protocol "token".
    expect(chooseAuth(null, "k")?.protocols[0]).toBe("token");
    expect(chooseAuth("t", undefined)?.protocols[0]).toBe("bearer");
  });

  it("returns null when there is no credential at all", () => {
    expect(chooseAuth(null, undefined)).toBeNull();
    expect(chooseAuth(null, "")).toBeNull();
  });

  it("ignores an empty token rather than opening an unauthenticated socket", () => {
    expect(chooseAuth("", "raw-key")?.mode).toBe("key");
  });
});

describe("backoffDelay", () => {
  it("grows exponentially", () => {
    expect(backoffDelay(0)).toBe(500);
    expect(backoffDelay(1)).toBe(1000);
    expect(backoffDelay(2)).toBe(2000);
  });

  it("caps at the maximum", () => {
    expect(backoffDelay(20)).toBe(MAX_BACKOFF_MS);
  });
});

describe("shouldSubmit", () => {
  const msg = (over: Record<string, unknown>) => ({
    type: "Results",
    is_final: false,
    speech_final: false,
    channel: { alternatives: [{ transcript: "hello there" }] },
    ...over,
  });

  it("submits on speech_final", () => {
    expect(shouldSubmit(msg({ speech_final: true }))).toBe(true);
  });

  it("does NOT submit on is_final alone", () => {
    // is_final fires constantly; submitting on it would spam the LLM.
    expect(shouldSubmit(msg({ is_final: true }))).toBe(false);
  });

  it("does not submit on an interim result", () => {
    expect(shouldSubmit(msg({}))).toBe(false);
  });

  it("does not submit an empty transcript", () => {
    expect(
      shouldSubmit(
        msg({
          speech_final: true,
          channel: { alternatives: [{ transcript: "   " }] },
        }),
      ),
    ).toBe(false);
  });

  it("ignores non-Results messages", () => {
    expect(shouldSubmit({ type: "Metadata" })).toBe(false);
  });

  it("tolerates a malformed payload", () => {
    expect(shouldSubmit({ type: "Results", speech_final: true })).toBe(false);
  });

  it("tolerates null", () => {
    expect(shouldSubmit(null)).toBe(false);
  });
});
