import { useState } from "react";
import { Controls } from "./ui/Controls";
import { TranscriptDisplay } from "./ui/TranscriptDisplay";
import { useAnalysis } from "./state/useAnalysis";
import type { ConnectionState, SourceMode } from "./types";
import "./styles.css";

const SAMPLE = "I think this is going to work really well";

export default function App() {
  const [source, setSource] = useState<SourceMode>("hardcoded");
  const [recording, setRecording] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [lines, setLines] = useState<string[]>([]);
  const { analysis, submit, lastError } = useAnalysis();

  const toggle = async () => {
    if (recording) {
      setRecording(false);
      setConnection("idle");
      return;
    }
    setRecording(true);
    setConnection("live");
    setLines((prev) => [...prev, SAMPLE]);
    await submit([SAMPLE]);
  };

  return (
    <div className="app">
      <TranscriptDisplay lines={lines} interim="" />
      <pre className="debug">{JSON.stringify(analysis, null, 2)}</pre>
      {lastError && <p className="error">{lastError}</p>}
      <Controls
        recording={recording}
        connection={connection}
        source={source}
        onToggle={toggle}
        onSourceChange={setSource}
      />
    </div>
  );
}
