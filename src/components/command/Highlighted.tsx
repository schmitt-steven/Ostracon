import type { Span } from "@/lib/search/highlight";

/**
 * Matched text, marked. Spans in, elements out — no string is ever parsed as
 * HTML, which is why the search layer returns offsets, not a marked string.
 */
export function Highlighted({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, index) =>
        span.hit ? (
          <mark key={index} className="search-hit">
            {span.text}
          </mark>
        ) : (
          <span key={index}>{span.text}</span>
        ),
      )}
    </>
  );
}
