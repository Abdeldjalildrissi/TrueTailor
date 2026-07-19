/**
 * Text normalization shared by the grounding verifier and merge logic.
 * Normalization is deliberately aggressive: the goal is to decide whether a
 * string plausibly appears in a source document despite PDF line wrapping,
 * hyphenation, curly quotes, and whitespace noise.
 */

/** Lowercase, unify unicode punctuation, collapse runs of non-alphanumerics to single spaces. */
export function normalize(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalization with every separator removed — tolerant of hyphenated line wraps. */
export function squash(input: string): string {
  return normalize(input).replace(/ /g, "");
}

export interface ChunkOptions {
  targetSize: number;
  maxSize: number;
}

const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { targetSize: 9000, maxSize: 12000 };

/**
 * Splits a document into chunks at paragraph boundaries for structured
 * extraction. Paragraphs larger than maxSize are hard-split as a last resort.
 */
export function chunkText(text: string, options: Partial<ChunkOptions> = {}): string[] {
  const { targetSize, maxSize } = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const trimmed = text.trim();
  if (trimmed.length <= maxSize) {
    return trimmed.length > 0 ? [trimmed] : [];
  }

  const paragraphs = trimmed.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";

  const push = () => {
    if (current.trim().length > 0) {
      chunks.push(current.trim());
    }
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxSize) {
      push();
      for (let offset = 0; offset < paragraph.length; offset += targetSize) {
        chunks.push(paragraph.slice(offset, offset + targetSize));
      }
      continue;
    }
    if (current.length > 0 && current.length + paragraph.length + 2 > targetSize) {
      push();
    }
    current = current.length > 0 ? `${current}\n\n${paragraph}` : paragraph;
  }
  push();

  return chunks;
}
