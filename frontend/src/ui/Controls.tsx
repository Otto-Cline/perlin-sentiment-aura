import type { ConnectionState, SourceMode } from "../types";

interface Props {
  recording: boolean;
  connection: ConnectionState;
  source: SourceMode;
  onToggle: () => void;
  onSourceChange: (mode: SourceMode) => void;
}

const LABELS: Record<ConnectionState, string> = {
  idle: "Idle",
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  error: "Error",
};

export function Controls({
  recording,
  connection,
  source,
  onToggle,
  onSourceChange,
}: Props) {
  return (
    <div className="controls">
      <button className={recording ? "stop" : "start"} onClick={onToggle}>
        {recording ? "Stop" : "Start"}
      </button>
      <span className={`status status-${connection}`}>
        <span className="dot" aria-hidden="true" />
        {LABELS[connection]}
      </span>
      <select
        value={source}
        onChange={(e) => onSourceChange(e.target.value as SourceMode)}
        aria-label="Analysis source"
      >
        <option value="demo">Demo mode</option>
        <option value="hardcoded">Backend (hardcoded)</option>
        <option value="live">Live mic</option>
      </select>
    </div>
  );
}
