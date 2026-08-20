import type { CSSProperties } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  /** Distinguishes the radio group from any other switch on the page. */
  name: string;
  ariaLabel: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedSwitch<T extends string>({
  name,
  ariaLabel,
  options,
  value,
  onChange,
}: Props<T>) {
  const activeIndex = Math.max(
    options.findIndex((o) => o.value === value),
    0,
  );

  return (
    <fieldset
      className="switch"
      style={
        {
          "--seg-width": `calc((100% - 4px) / ${options.length})`,
        } as CSSProperties
      }
    >
      <legend className="sr-only">{ariaLabel}</legend>
      <span
        className="switch-thumb"
        aria-hidden="true"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {options.map((option) => (
        <label
          key={option.value}
          className={option.value === value ? "is-active" : undefined}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
