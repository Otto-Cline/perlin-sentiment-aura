import { useCallback, useRef, useState } from "react";
import { type Analysis, NEUTRAL_ANALYSIS } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

/**
 * Guards against out-of-order LLM responses. Each request gets a monotonic
 * sequence number; a response is applied only if it is strictly newer than the
 * last one applied. Stale sentiment overwriting fresh sentiment is the bug this
 * exists to prevent.
 */
export class AnalysisGate {
  private nextSeq = 0;
  private lastApplied = -1;

  issue(): number {
    return this.nextSeq++;
  }

  accept(seq: number): boolean {
    if (seq <= this.lastApplied) return false;
    this.lastApplied = seq;
    return true;
  }
}

export function useAnalysis() {
  // React state drives the DOM UI; the ref is what the p5 sketch reads each
  // frame. Both are updated together — never one without the other.
  const [analysis, setAnalysis] = useState<Analysis>(NEUTRAL_ANALYSIS);
  const analysisRef = useRef<Analysis>(NEUTRAL_ANALYSIS);
  const gateRef = useRef(new AnalysisGate());
  const [lastError, setLastError] = useState<string | null>(null);

  const apply = useCallback((next: Analysis) => {
    analysisRef.current = next;
    setAnalysis(next);
  }, []);

  const submit = useCallback(
    async (utterances: string[]) => {
      const seq = gateRef.current.issue();
      try {
        const res = await fetch(`${API_BASE}/process_text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ utterances: utterances.slice(-3), seq }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { seq: number; analysis: Analysis };
        if (!gateRef.current.accept(data.seq)) return;
        setLastError(null);
        apply(data.analysis);
      } catch (err) {
        // Drift toward neutral rather than freezing on the last good value.
        setLastError(err instanceof Error ? err.message : "request failed");
        apply(NEUTRAL_ANALYSIS);
      }
    },
    [apply],
  );

  return { analysis, analysisRef, submit, apply, lastError };
}
