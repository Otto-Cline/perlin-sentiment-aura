import { useEffect, useRef } from "react";
import p5 from "p5";
import type { RefObject } from "react";
import type { Analysis, ConnectionState, Keyword } from "../types";
import { blitPaper, createPaperLayer } from "./paper";
import { compositeMarker, createHighlighterLayer } from "./highlighter";
import {
  createKeywordLayer,
  mergePlaced,
  type PlacedKeyword,
} from "./keywordPaper";
import { mapHighlighter } from "./highlighterMapping";
import { HIGHLIGHTER } from "./preset";
import type { PaperWear } from "./wear";

interface Props {
  analysisRef: RefObject<Analysis>;
  keywordsRef: RefObject<Keyword[]>;
  connection: ConnectionState;
  wearRef: RefObject<PaperWear>;
}

/** Same per-frame easing as before. Nothing snaps. */
const EASING = 0.04;
const FADE_BITE = 0.004;

/**
 * Composites the three layers: crinkled paper, then the page's words, then the
 * highlighter on top with `multiply` so the words read through the marker.
 *
 * p5 owns the canvas and the frame loop; the drawing goes through
 * `p.drawingContext`.
 */
export function HighlighterAura({
  analysisRef,
  keywordsRef,
  connection,
  wearRef,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  const connectionRef = useRef(connection);
  connectionRef.current = connection;

  useEffect(() => {
    if (!hostRef.current) return;

    const sketch = (p: p5) => {
      const targetsNow = () =>
        mapHighlighter(
          analysisRef.current,
          connectionRef.current,
          wearRef.current?.crinkle ?? 0,
        );

      let paper: ReturnType<typeof createPaperLayer> | null = null;
      let marker: ReturnType<typeof createHighlighterLayer> | null = null;
      let words: ReturnType<typeof createKeywordLayer> | null = null;
      let placed: PlacedKeyword[] = [];
      let seenKeywords: Keyword[] | null = null;
      let eased = targetsNow();
      let t = 0;
      let fadeAccumulator = 0;
      let seeded = false;

      const markerParams = () => ({
        hue: eased.hue,
        saturation: eased.saturation,
        lightness: eased.lightness,
        alpha: eased.alpha,
        thickness: eased.thickness,
        speed: eased.speed,
        turnSharpness: eased.turnSharpness,
      });

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.pixelDensity(1);
        // Built here, not in the closure: p.windowWidth is still 0 above.
        paper = createPaperLayer(p.width, p.height);
        marker = createHighlighterLayer(p.width, p.height);
        words = createKeywordLayer(p.width, p.height);
      };

      p.draw = () => {
        if (!paper || !marker || !words) return;

        const target = targetsNow();
        for (const key of Object.keys(eased) as (keyof typeof eased)[]) {
          eased[key] += (target[key] - eased[key]) * EASING;
        }

        const now = p.millis();

        // New words land on the page as the model returns them.
        const incoming = keywordsRef.current;
        if (incoming && incoming !== seenKeywords) {
          seenKeywords = incoming;
          if (incoming.length > 0) {
            placed = mergePlaced(placed, incoming, p.width, p.height, now);
          }
        }

        if (!seeded) {
          marker.seed(markerParams(), t, HIGHLIGHTER.seedSteps);
          seeded = true;
        }

        t += 0.004 + eased.speed * 0.0006;

        paper.update(
          {
            crinkle: eased.crinkle,
            grainScale: HIGHLIGHTER.grainScale,
            temperature: eased.temperature,
          },
          t,
          now,
        );

        fadeAccumulator += HIGHLIGHTER.fadeRate;
        if (fadeAccumulator >= FADE_BITE) {
          marker.fade(fadeAccumulator);
          fadeAccumulator = 0;
        }

        marker.step(markerParams(), t);

        // Words are rendered to their own layer and knocked down wherever the
        // marker covers them, so the marker plainly sits on top.
        words.render(placed, now, marker.canvas);

        const ctx = p.drawingContext as CanvasRenderingContext2D;
        ctx.clearRect(0, 0, p.width, p.height);
        blitPaper(ctx, paper, p.width, p.height);
        ctx.drawImage(words.canvas, 0, 0);
        compositeMarker(ctx, marker.canvas);
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        paper?.resize(p.width, p.height);
        marker?.resize(p.width, p.height);
        words?.resize(p.width, p.height);
        paper?.invalidate();
        seeded = false;
      };
    };

    const instance = new p5(sketch, hostRef.current);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__p5 = instance;
    }
    return () => instance.remove();
  }, [analysisRef, keywordsRef, wearRef]);

  return <div className="aura" ref={hostRef} />;
}
