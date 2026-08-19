import type { Span } from "@/lib/search/highlight";

/**
 * Matched text, marked.
 *
 * Spans in, elements out — the matched runs never pass through a string that
 * gets parsed as HTML, so a note titled `<img onerror=…>` renders as that
 * title and nothing else. This is the only reason the search layer returns
 * offsets instead of a pre-marked string.
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
