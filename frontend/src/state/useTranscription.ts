import { useCallback, useRef } from "react";
import type { ConnectionState } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

// No encoding/sample_rate params: those are for raw PCM. MediaRecorder sends
// containerized WebM/Opus, which Deepgram detects on its own.
const DEEPGRAM_URL =
  "wss://api.deepgram.com/v1/listen" +
  "?model=nova-3&smart_format=true&interim_results=true&punctuate=true";

/**
 * Browsers cannot set WebSocket headers, so credentials ride the
 * Sec-WebSocket-Protocol header.
 *
 * `["token", KEY]` is the documented API-key form and is verified working — a
 * handshake against Deepgram negotiated protocol "token". A minted JWT uses the
 * Bearer scheme instead; that path is unverified, because the key available
 * during development lacked permission to mint tokens.
 */
const jwtSubprotocol = (token: string) => ["bearer", token];
const keySubprotocol = (key: string) => ["token", key];

export type AuthMode = "token" | "key";

export interface SocketAuth {
  protocols: string[];
  mode: AuthMode;
}

/**
 * Chooses how to authenticate the socket.
 *
 * A short-lived token is always preferred, so the API key never reaches the
 * browser. The key is a deliberate fallback: minting a token requires a
 * Deepgram key with permission to do so, and a key without it returns
 * `FORBIDDEN / Insufficient permissions`. Falling back keeps the demo working
 * and upgrades itself the moment a token-capable key is supplied.
 */
export function chooseAuth(
  accessToken: string | null,
  envKey: string | undefined,
): SocketAuth | null {
  if (accessToken) {
    return { protocols: jwtSubprotocol(accessToken), mode: "token" };
  }
  if (envKey) {
    return { protocols: keySubprotocol(envKey), mode: "key" };
  }
  return null;
}

const KEEPALIVE_MS = 8000; // Deepgram drops the socket after ~10s of silence.
export const MAX_BACKOFF_MS = 8000;
const MAX_ATTEMPTS = 6;

export function backoffDelay(attempt: number): number {
  return Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
}

export function transcriptOf(msg: unknown): string {
  const alt = (msg as { channel?: { alternatives?: { transcript?: string }[] } })
    ?.channel?.alternatives?.[0];
  return alt?.transcript ?? "";
}

/**
 * Fire the backend call on speech_final only. is_final fires on every finalized
 * interim chunk — many times per sentence — and would spam the LLM.
 */
export function shouldSubmit(msg: unknown): boolean {
  const m = msg as { type?: string; speech_final?: boolean } | null;
  if (m?.type !== "Results") return false;
  if (!m.speech_final) return false;
  return transcriptOf(msg).trim().length > 0;
}

interface Options {
  onSpeechFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onConnectionChange: (state: ConnectionState) => void;
}

export function useTranscription({
  onSpeechFinal,
  onInterim,
  onConnectionChange,
}: Options) {
  const socketRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const wantOpenRef = useRef(false);

  const teardownSocket = useCallback(() => {
    if (keepaliveRef.current) clearInterval(keepaliveRef.current);
    keepaliveRef.current = null;
    const sock = socketRef.current;
    socketRef.current = null;
    if (sock && sock.readyState === WebSocket.OPEN) {
      // Flushes the final utterance instead of dropping it.
      sock.send(JSON.stringify({ type: "CloseStream" }));
    }
    sock?.close();
  }, []);

  /** Releases mic, recorder and socket without touching connection state. */
  const releaseResources = useCallback(() => {
    wantOpenRef.current = false;
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    teardownSocket();
  }, [teardownSocket]);

  const stop = useCallback(() => {
    releaseResources();
    onConnectionChange("idle");
  }, [onConnectionChange, releaseResources]);

  const connect = useCallback(async () => {
    onConnectionChange(attemptRef.current === 0 ? "connecting" : "reconnecting");

    // Ask the backend to mint a token; fall back to a browser key if it cannot.
    let accessToken: string | null = null;
    try {
      const res = await fetch(`${API_BASE}/deepgram_token`);
      if (res.ok) {
        const body = (await res.json()) as { access_token?: string };
        accessToken = body.access_token ?? null;
      }
    } catch {
      // Backend unreachable — the key fallback below may still work.
    }

    const auth = chooseAuth(accessToken, import.meta.env.VITE_DEEPGRAM_KEY);
    if (!auth) {
      throw new Error(
        "No Deepgram credential: the token endpoint is unavailable and " +
          "VITE_DEEPGRAM_KEY is not set.",
      );
    }
    if (auth.mode === "key") {
      console.warn(
        "Deepgram: using the API key from the browser. The backend could not " +
          "mint a short-lived token — see README, Known tradeoffs.",
      );
    }

    const socket = new WebSocket(DEEPGRAM_URL, auth.protocols);
    socketRef.current = socket;

    socket.onopen = () => {
      attemptRef.current = 0;
      onConnectionChange("live");
      keepaliveRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "KeepAlive" }));
        }
      }, KEEPALIVE_MS);
      if (recorderRef.current?.state === "inactive") {
        recorderRef.current.start(250);
      }
    };

    socket.onmessage = (event) => {
      let msg: unknown;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if ((msg as { type?: string })?.type !== "Results") return;
      const text = transcriptOf(msg).trim();
      if (shouldSubmit(msg)) {
        onInterim("");
        onSpeechFinal(text);
      } else if (text) {
        onInterim(text);
      }
    };

    socket.onclose = () => {
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
      if (!wantOpenRef.current) return;

      if (attemptRef.current >= MAX_ATTEMPTS) {
        onConnectionChange("error");
        return;
      }
      const delay = backoffDelay(attemptRef.current++);
      onConnectionChange("reconnecting");
      retryRef.current = setTimeout(() => {
        connect().catch(() => onConnectionChange("error"));
      }, delay);
    };
  }, [onConnectionChange, onInterim, onSpeechFinal]);

  /** Returns false if the mic or the token endpoint refused, leaving the
   *  connection in the `error` state so the aura shows it. */
  const start = useCallback(async (): Promise<boolean> => {
    wantOpenRef.current = true;
    attemptRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(e.data);
        }
      };

      await connect();
      return true;
    } catch {
      // Release everything but keep `error` visible — calling stop() here would
      // reset to `idle` and hide the failure the user needs to see.
      releaseResources();
      onConnectionChange("error");
      return false;
    }
  }, [connect, onConnectionChange, releaseResources]);

  return { start, stop };
}
