import { SegmentedSwitch, type SegmentOption } from "./SegmentedSwitch";
import type { SourceMode } from "../types";

interface Props {
  source: SourceMode;
  onChange: (mode: SourceMode) => void;
}

/** Named for what the user gets, not for how it's wired. */
const MODES: SegmentOption<SourceMode>[] = [
  { value: "demo", label: "Demo" },
  { value: "live", label: "Live mic" },
];

export function SourceSwitch({ source, onChange }: Props) {
  return (
    <SegmentedSwitch
      name="source"
      ariaLabel="Analysis source"
      options={MODES}
      value={source}
      onChange={onChange}
    />
  );
}
