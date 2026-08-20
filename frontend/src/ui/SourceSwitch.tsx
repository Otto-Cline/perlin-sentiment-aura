import type { CSSProperties } from "react";
import type { SourceMode } from "../types";

interface Props {
  source: SourceMode;
  onChange: (mode: SourceMode) => void;
}

/** Named for what the user gets, not for how it's wired. */
const MODES: { value: SourceMode; label: string }[] = [
  { value: "demo", label: "Demo" },
  { value: "hardcoded", label: "Sample" },
  { value: "live", label: "Live mic" },
];

export function SourceSwitch({ source, onChange }: Props) {
  const activeIndex = Math.max(
    MODES.findIndex((m) => m.value === source),
    0,
  );

  return (
    <fieldset
      className="switch"
      style={
        {
          "--seg-width": `calc((100% - 4px) / ${MODES.length})`,
        } as CSSProperties
      }
    >
      <legend className="sr-only">Analysis source</legend>
      <span
        className="switch-thumb"
        aria-hidden="true"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {MODES.map((mode) => (
        <label
          key={mode.value}
          className={mode.value === source ? "is-active" : undefined}
        >
          <input
            type="radio"
            name="source"
            value={mode.value}
            checked={mode.value === source}
            onChange={() => onChange(mode.value)}
          />
          {mode.label}
        </label>
      ))}
    </fieldset>
  );
}
