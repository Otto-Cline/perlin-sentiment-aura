import { SegmentedSwitch, type SegmentOption } from "./SegmentedSwitch";
import type { RendererMode } from "../types";

interface Props {
  renderer: RendererMode;
  onChange: (mode: RendererMode) => void;
}

const MODES: SegmentOption<RendererMode>[] = [
  { value: "ink", label: "Ink" },
  { value: "streams", label: "Streams" },
];

export function RendererSwitch({ renderer, onChange }: Props) {
  return (
    <SegmentedSwitch
      name="renderer"
      ariaLabel="Visualization style"
      options={MODES}
      value={renderer}
      onChange={onChange}
    />
  );
}
