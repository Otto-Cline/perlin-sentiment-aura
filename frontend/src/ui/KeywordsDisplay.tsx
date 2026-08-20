import type { LiveKeyword } from "../state/useKeywordCloud";

interface Props {
  keywords: LiveKeyword[];
}

/**
 * The keywords are drawn onto the canvas now, where the highlighter can pass
 * over them. Canvas text is invisible to assistive technology, so this mirrors
 * them into the DOM, visually hidden.
 */
export function KeywordsDisplay({ keywords }: Props) {
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="false">
      <h2>Detected keywords</h2>
      <ul>
        {keywords.map((kw) => (
          <li key={kw.text}>{kw.text}</li>
        ))}
      </ul>
    </div>
  );
}
