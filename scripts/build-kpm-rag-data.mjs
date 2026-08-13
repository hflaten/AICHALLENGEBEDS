import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(root, "data", "rag_kpm_v2_clean.jsonl");
const targetPath = join(root, "src", "lib", "leads", "kpm-rag-data.ts");

const records = readFileSync(sourcePath, "utf8")
  .trim()
  .split(/\n/)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL on line ${index + 1}: ${error.message}`);
    }
  });

writeFileSync(
  targetPath,
  `import type { KpmRagRecord } from "./rag-types";\n\nexport const kpmRagRecords = ${JSON.stringify(records, null, 2)} as KpmRagRecord[];\n`,
);
