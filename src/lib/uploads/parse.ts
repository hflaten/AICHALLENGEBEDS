import JSZip from "jszip";
import type { ParsedSection, ParsedUpload } from "./types";

const MAX_TEXT_CHARS = 180_000;

export async function parseUploadedFile(file: File): Promise<ParsedUpload> {
  const fileName = file.name;
  const contentType = file.type || inferContentType(fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = getExtension(fileName);
  let sections: ParsedSection[];

  if (contentType === "application/pdf" || ext === "pdf") {
    sections = await parsePdf(buffer);
  } else if (isDocx(contentType, ext)) {
    sections = await parseOfficeXml(buffer, "word/document.xml", "Document");
  } else if (isPptx(contentType, ext)) {
    sections = await parsePptx(buffer);
  } else if (isXlsx(contentType, ext)) {
    sections = ext === "csv" || contentType === "text/csv" ? parseCsv(buffer) : await parseWorkbook(buffer);
  } else if (isPlainText(contentType, ext)) {
    sections = [{ label: "Text", text: buffer.toString("utf8") }];
  } else {
    throw new Error("Unsupported file type. Upload PDF, DOCX, PPTX, XLSX, CSV, TXT, or MD files.");
  }

  const text = sections
    .map((section) => `${section.label}\n${section.text}`)
    .join("\n\n")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  if (text.length < 20) {
    throw new Error("The uploaded file did not contain enough readable text to index.");
  }

  return { contentType, fileName, sections, text };
}

async function parsePdf(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  await parser.destroy();
  return [{ label: "PDF text", text: parsed.text || "" }];
}

async function parseOfficeXml(buffer: Buffer, xmlPath: string, label: string) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file(xmlPath)?.async("string");
  if (!xml) return [];

  return [{ label, text: extractXmlText(xml) }];
}

async function parsePptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1] || 0) - Number(b.match(/slide(\d+)/)?.[1] || 0));
  const sections: ParsedSection[] = [];

  for (const path of slideFiles) {
    const xml = await zip.file(path)?.async("string");
    if (!xml) continue;
    sections.push({ label: `Slide ${path.match(/slide(\d+)/)?.[1] || sections.length + 1}`, text: extractXmlText(xml) });
  }

  return sections;
}

function parseCsv(buffer: Buffer) {
  return [{ label: "CSV", text: buffer.toString("utf8") }];
}

async function parseWorkbook(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings = await readSharedStrings(zip);
  const sheetFiles = Object.keys(zip.files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.match(/sheet(\d+)/)?.[1] || 0) - Number(b.match(/sheet(\d+)/)?.[1] || 0));
  const sections: ParsedSection[] = [];

  for (const path of sheetFiles) {
    const xml = await zip.file(path)?.async("string");
    if (!xml) continue;
    const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)]
      .map((row) =>
        [...row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)]
          .map((cell) => extractCellText(cell[1], cell[2], sharedStrings))
          .filter(Boolean)
          .join(", "),
      )
      .filter(Boolean);

    sections.push({
      label: `Sheet ${path.match(/sheet(\d+)/)?.[1] || sections.length + 1}`,
      text: rows.join("\n"),
    });
  }

  return sections;
}

async function readSharedStrings(zip: JSZip) {
  const xml = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (!xml) return [];

  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => extractXmlText(match[1]));
}

function extractCellText(attributes: string, xml: string, sharedStrings: string[]) {
  const value = xml.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1];
  const inline = xml.match(/<is[^>]*>([\s\S]*?)<\/is>/)?.[1];

  if (attributes.includes('t="s"') && value) {
    return sharedStrings[Number(value)] || "";
  }

  if (inline) {
    return extractXmlText(inline);
  }

  return value ? decodeXml(value) : "";
}

function extractXmlText(xml: string) {
  return xml
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (entity) => decodeXml(entity))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function getExtension(fileName: string) {
  return fileName.toLowerCase().split(".").pop() || "";
}

function inferContentType(fileName: string) {
  const ext = getExtension(fileName);
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "csv") return "text/csv";
  if (ext === "md") return "text/markdown";
  return "text/plain";
}

function isDocx(contentType: string, ext: string) {
  return ext === "docx" || contentType.includes("wordprocessingml");
}

function isPptx(contentType: string, ext: string) {
  return ext === "pptx" || contentType.includes("presentationml");
}

function isXlsx(contentType: string, ext: string) {
  return ext === "xlsx" || ext === "csv" || contentType.includes("spreadsheetml") || contentType === "text/csv";
}

function isPlainText(contentType: string, ext: string) {
  return ["txt", "md", "json", "jsonl"].includes(ext) || contentType.startsWith("text/");
}
