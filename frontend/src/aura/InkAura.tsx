import { useEffect, useRef } from "react";
import p5 from "p5";
import type { RefObject } from "react";
import type { Analysis, ConnectionState } from "../types";
import { mapInk } from "./inkMapping";
import { createInkRenderer } from "./inkRenderer";
import type { PaperWear } from "./wear";

interface Props {
  analysisRef: RefObject<Analysis>;
  connection: ConnectionState;
  wearRef: RefObject<PaperWear>;
}

/**
 * The ink renderer's React host.
 *
 * p5 still owns the canvas and the frame loop — the brief asks for a p5 canvas,
 * and this keeps that true in both renderer modes. The drawing itself goes
 * through `p.drawingContext`, a real CanvasRenderingContext2D, which is why the
 * same renderer runs unchanged on the standalone tuning page.
 */
export function InkAura({ analysisRef, connection, wearRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  // Read per frame, so it must arrive by ref rather than through the closure.
  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  useEffect(() => {
    if (!hostRef.current) return;

    const sketch = (p: p5) => {
      const targetsNow = () =>
        mapInk(
          analysisRef.current,
          connectionRef.current,
          wearRef.current?.crinkle ?? 0,
        );

      // Built in setup, not here: p.windowWidth is still 0 while the sketch
      // closure runs, which would size the offscreen layers to nothing.
      let renderer: ReturnType<typeof createInkRenderer> | null = null;

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.pixelDensity(1);
        renderer = createInkRenderer(p.width, p.height, targetsNow());
      };

      p.draw = () => {
        if (!renderer) return;
        renderer.render(
          p.drawingContext as CanvasRenderingContext2D,
          targetsNow(),
          p.millis(),
        );
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        renderer?.resize(p.width, p.height);
      };
    };

    const instance = new p5(sketch, hostRef.current);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__p5 = instance;
    }
    return () => instance.remove();
  }, [analysisRef, wearRef]);

  return <div className="aura" ref={hostRef} />;
}
