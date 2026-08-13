import type { DocumentChunk, ParsedUpload } from "./types";

const MAX_CHUNK_CHARS = 2_800;
const CHUNK_OVERLAP_CHARS = 250;

export function chunkParsedUpload(parsed: ParsedUpload): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  for (const section of parsed.sections) {
    const text = section.text.trim();
    if (!text) continue;

    for (const content of chunkText(text)) {
      chunks.push({
        chunkIndex: chunks.length,
        content,
        metadata: {
          content_type: parsed.contentType,
          file_name: parsed.fileName,
          section: section.label,
        },
      });
    }
  }

  return chunks.length
    ? chunks
    : [
        {
          chunkIndex: 0,
          content: parsed.text,
          metadata: { content_type: parsed.contentType, file_name: parsed.fileName, section: "Document" },
        },
      ];
}

function chunkText(text: string) {
  const paragraphs = text
    .split(/\n{2,}|\r\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    if ((current + "\n\n" + paragraph).trim().length > MAX_CHUNK_CHARS && current) {
      chunks.push(current.trim());
      current = current.slice(Math.max(0, current.length - CHUNK_OVERLAP_CHARS));
    }
    current = [current, paragraph].filter(Boolean).join("\n\n");
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks.flatMap((chunk) => {
    if (chunk.length <= MAX_CHUNK_CHARS * 1.25) return [chunk];
    const parts: string[] = [];
    for (let index = 0; index < chunk.length; index += MAX_CHUNK_CHARS) {
      parts.push(chunk.slice(index, index + MAX_CHUNK_CHARS));
    }
    return parts;
  });
}
