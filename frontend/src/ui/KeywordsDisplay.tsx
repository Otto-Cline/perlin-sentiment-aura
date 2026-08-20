import type { LiveKeyword } from "../state/useKeywordCloud";

interface Props {
  keywords: LiveKeyword[];
}

const STAGGER_MS = 140;

export function KeywordsDisplay({ keywords }: Props) {
  return (
    <div className="keywords">
      {keywords.map((kw, i) => (
        // Keyed by text: index keys would restart the animation on re-render.
        <span
          key={kw.text}
          className="keyword"
          style={{
            fontSize: `${14 + kw.weight * 26}px`,
            opacity: 0.35 + kw.weight * 0.65,
            animationDelay: `${(i % 6) * STAGGER_MS}ms`,
          }}
        >
          {kw.text}
        </span>
      ))}
    </div>
  );
}
