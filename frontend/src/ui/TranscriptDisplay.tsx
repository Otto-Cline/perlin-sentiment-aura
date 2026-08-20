interface Props {
  lines: string[];
  interim: string;
}

export function TranscriptDisplay({ lines, interim }: Props) {
  return (
    <div className="transcript">
      {lines.slice(-8).map((line, i) => (
        // Committed lines are append-only, so index is stable here.
        <p key={`${i}-${line}`} className="final">
          {line}
        </p>
      ))}
      {interim && <p className="interim">{interim}</p>}
    </div>
  );
}
