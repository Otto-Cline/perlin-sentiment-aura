import { useEffect, useRef } from "react";
import p5 from "p5";
import type { RefObject } from "react";
import type { Analysis, ConnectionState } from "../types";
import { mapAnalysis, type VisualTargets } from "./mapping";
import { createSketch } from "./sketch";

interface Props {
  analysisRef: RefObject<Analysis>;
  connection: ConnectionState;
}

export function Aura({ analysisRef, connection }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  // Connection state changes on a React render, but the sketch reads it per
  // frame — so it goes through a ref too, not the sketch closure.
  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  useEffect(() => {
    if (!hostRef.current) return;
    const getTargets = (): VisualTargets =>
      mapAnalysis(analysisRef.current, connectionRef.current);
    const instance = new p5(createSketch(getTargets), hostRef.current);
    if (import.meta.env.DEV) {
      // Lets a headless check drive frames with instance.redraw(n). Browsers
      // suspend requestAnimationFrame in hidden tabs, so an automated visual
      // check cannot rely on the normal loop.
      (window as unknown as Record<string, unknown>).__p5 = instance;
    }
    return () => instance.remove();
    // Mount once. Every value the sketch needs arrives through a ref.
  }, [analysisRef]);

  return <div className="aura" ref={hostRef} />;
}
