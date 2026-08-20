import { useCallback, useEffect, useRef, useState } from "react";
import { Controls } from "./ui/Controls";
import { TranscriptDisplay } from "./ui/TranscriptDisplay";
import { useAnalysis } from "./state/useAnalysis";
import { createDemoDriver } from "./demo/driver";
import { Aura } from "./aura/Aura";
import type { Analysis, ConnectionState, SourceMode } from "./types";
import "./styles.css";

const SAMPLE = "I think this is going to work really well";

export default function App() {
  const [source, setSource] = useState<SourceMode>("demo");
  const [recording, setRecording] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const { analysis, analysisRef, submit, apply, lastError } = useAnalysis();

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

  const stop = useCallback(() => {
    driverRef.current.stop();
    setRecording(false);
    setConnection("idle");
  }, []);

  const start = useCallback(async () => {
    setRecording(true);
    if (source === "demo") {
      setConnection("live");
      driverRef.current.start();
      return;
    }
    if (source === "hardcoded") {
      setConnection("live");
      setLines((prev) => [...prev, SAMPLE]);
      await submit([SAMPLE]);
      return;
    }
    setConnection("connecting"); // Task 7 replaces this with the real socket.
  }, [source, submit]);

  const toggle = () => (recording ? stop() : void start());

  // Switching source mid-run always stops cleanly first.
  const changeSource = (next: SourceMode) => {
    stop();
    setSource(next);
  };

  return (
    <div className="app">
      <Aura analysisRef={analysisRef} connection={connection} />
      <TranscriptDisplay lines={lines} interim="" />
      <pre className="debug">{JSON.stringify(analysis, null, 2)}</pre>
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
