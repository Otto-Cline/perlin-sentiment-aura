import { useCallback, useEffect, useRef, useState } from "react";
import { Controls } from "./ui/Controls";
import { TranscriptDisplay } from "./ui/TranscriptDisplay";
import { useAnalysis } from "./state/useAnalysis";
import { useTranscription } from "./state/useTranscription";
import { createDemoDriver } from "./demo/driver";
import { HighlighterAura } from "./aura/HighlighterAura";
import { PaperWear } from "./aura/wear";
import { KeywordsDisplay } from "./ui/KeywordsDisplay";
import { useKeywordCloud } from "./state/useKeywordCloud";
import type {
  Analysis,
  ConnectionState,
  Keyword,
  SourceMode,
} from "./types";
import "./styles.css";

// An empty panel is an invitation to act, so it says what to do next.
const PLACEHOLDER: Record<SourceMode, string> = {
  demo: "Press Start to play the scripted demo.",
  live: "Press Start, allow the microphone, then speak.",
};

export default function App() {
  const [source, setSource] = useState<SourceMode>("demo");
  const [recording, setRecording] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const { analysis, analysisRef, submit, apply, lastError } = useAnalysis();
  const keywords = useKeywordCloud(analysis.keywords);

  // Wear is cumulative across the whole session and survives a renderer switch,
  // so it lives here rather than inside a renderer.
  const wearRef = useRef(new PaperWear());

  // Once per analysis update — never per frame. At 60fps a per-frame call
  // saturates the crinkle in under three seconds and the session-long reading
  // of the paper stops meaning anything.
  useEffect(() => {
    wearRef.current.add(analysis.arousal);
  }, [analysis]);

  // The canvas reads keywords per frame, so they arrive by ref rather than as a
  // prop — same reason the analysis does.
  const keywordsRef = useRef<Keyword[]>(analysis.keywords);
  keywordsRef.current = analysis.keywords;

  const onDemoUpdate = useCallback(
    (next: Analysis, line: string) => {
      setLines((prev) => [...prev, line]);
      apply(next);
    },
    [apply],
  );

  const driverRef = useRef(createDemoDriver(onDemoUpdate));

  // The callback identity is stable via useCallback, but rebuild the driver if
  // it ever changes so the closure never goes stale.
  useEffect(() => {
    driverRef.current.stop();
    driverRef.current = createDemoDriver(onDemoUpdate);
  }, [onDemoUpdate]);

  useEffect(() => () => driverRef.current.stop(), []);

  // Rolling window of the last 3 utterances — scoring a single utterance makes
  // the values thrash on filler words.
  const windowRef = useRef<string[]>([]);

  const onSpeechFinal = useCallback(
    (text: string) => {
      setLines((prev) => [...prev, text]);
      windowRef.current = [...windowRef.current, text].slice(-3);
      void submit(windowRef.current);
    },
    [submit],
  );

  const transcription = useTranscription({
    onSpeechFinal,
    onInterim: setInterim,
    onConnectionChange: setConnection,
  });

  const stop = useCallback(() => {
    driverRef.current.stop();
    transcription.stop();
    setInterim("");
    setRecording(false);
    setConnection("idle");
  }, [transcription]);

  const start = useCallback(async () => {
    setRecording(true);
    if (source === "demo") {
      setConnection("live");
      driverRef.current.start();
      return;
    }
    // A failed start leaves connection in `error`; recording must follow or the
    // button says "Stop" while nothing is running.
    const started = await transcription.start();
    if (!started) setRecording(false);
  }, [source, transcription]);

  const toggle = () => (recording ? stop() : void start());

  // Switching source mid-run always stops cleanly first.
  const changeSource = (next: SourceMode) => {
    stop();
    setSource(next);
  };

  return (
    <div className="app">
      <HighlighterAura
        analysisRef={analysisRef}
        keywordsRef={keywordsRef}
        connection={connection}
        wearRef={wearRef}
      />
      <TranscriptDisplay
        lines={lines}
        interim={interim}
        placeholder={PLACEHOLDER[source]}
      />
      <KeywordsDisplay keywords={keywords} />
      {analysis.rationale && <p className="rationale">{analysis.rationale}</p>}
      {lastError && <p className="error">{lastError}</p>}
      <Controls
        recording={recording}
        connection={connection}
        source={source}
        onToggle={toggle}
        onSourceChange={changeSource}
      />
    </div>
  );
}
