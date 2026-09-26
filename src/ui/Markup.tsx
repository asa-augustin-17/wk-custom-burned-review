import { parseMarkup } from '../logic/markup';

/** Renders WK mnemonic markup as styled spans. Never uses innerHTML. */
export function Markup({ text }: { text: string | null | undefined }) {
  return (
    <>
      {parseMarkup(text).map((seg, i) =>
        seg.tag ? (
          <span key={i} className={`mk mk-${seg.tag}`}>
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}
