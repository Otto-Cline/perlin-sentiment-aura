import { splitWords, visibleLines } from "./transcriptLines";

interface Props {
  lines: string[];
  interim: string;
  placeholder: string;
}

// Per-word entrance beat. Capped so a long utterance still finishes promptly.
const WORD_STAGGER_MS = 28;
const MAX_STAGGERED_WORDS = 24;

export function TranscriptDisplay({ lines, interim, placeholder }: Props) {
  const shown = visibleLines(lines);
  const empty = shown.length === 0 && !interim;

  return (
    <div className="transcript">
      <span className="label">Transcript</span>

      {empty && <p className="placeholder">{placeholder}</p>}

      {shown.map((line) => {
        const words = splitWords(line.text);
        return (
          <p key={line.id} className="final">
            {words.map((word, i) => (
              <span
                key={`${line.id}-${i}`}
                className="word"
                style={{
                  animationDelay: `${
                    Math.min(i, MAX_STAGGERED_WORDS) * WORD_STAGGER_MS
                  }ms`,
                }}
              >
                {i < words.length - 1 ? `${word} ` : word}
              </span>
            ))}
          </p>
        );
      })}

      {interim && <p className="interim">{interim}</p>}
    </div>
  );
}
