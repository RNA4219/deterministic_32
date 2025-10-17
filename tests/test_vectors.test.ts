import test from "node:test";
import assert from "node:assert";

import { Cat32 } from "../src/index.js";

type VectorRow = {
  input: string;
  hash: string;
  index: number;
};

type ParsedTables = {
  unsalted: VectorRow[];
  salted: VectorRow[];
};

type FsPromisesModule = {
  readFile(path: string, options: { encoding: string }): Promise<string>;
};

const dynamicImport = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<unknown>;

const TEST_VECTOR_DOC_PATH = import.meta.url.includes("/dist/tests/")
  ? new URL("../../docs/TEST_VECTORS.md", import.meta.url)
  : new URL("../docs/TEST_VECTORS.md", import.meta.url);

const testVectorsPromise: Promise<ParsedTables> = (async () => {
  const { readFile } = (await dynamicImport("node:fs/promises")) as FsPromisesModule;
  const markdown = await readFile(TEST_VECTOR_DOC_PATH.pathname, { encoding: "utf8" });
  return {
    unsalted: parseTable(markdown, "Unsalted"),
    salted: parseTable(markdown, "Salted (salt=projX, namespace=v1)"),
  };
})();

test("Cat32 matches documented unsalted vectors", async () => {
  const { unsalted } = await testVectorsPromise;
  const cat = new Cat32();
  for (const vector of unsalted) {
    const assignment = cat.assign(vector.input);
    assert.equal(assignment.hash, vector.hash, `hash mismatch for input ${JSON.stringify(vector.input)}`);
    assert.equal(assignment.index, vector.index, `index mismatch for input ${JSON.stringify(vector.input)}`);
  }
});

test("Cat32 matches documented salted vectors", async () => {
  const { salted } = await testVectorsPromise;
  const cat = new Cat32({ salt: "projX", namespace: "v1" });
  for (const vector of salted) {
    const assignment = cat.assign(vector.input);
    assert.equal(assignment.hash, vector.hash, `hash mismatch for input ${JSON.stringify(vector.input)}`);
    assert.equal(assignment.index, vector.index, `index mismatch for input ${JSON.stringify(vector.input)}`);
  }
});

function parseTable(markdown: string, heading: string): VectorRow[] {
  const sectionStart = markdown.indexOf(`## ${heading}`);
  if (sectionStart === -1) {
    throw new Error(`heading not found: ${heading}`);
  }
  const section = markdown.slice(sectionStart);
  const lines = section.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith("| input"));
  if (headerIndex === -1) {
    throw new Error(`table header missing for heading: ${heading}`);
  }
  const rows: VectorRow[] = [];
  for (let i = headerIndex + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) {
      break;
    }
    const cells = splitMarkdownRow(line).map((cell) => cell.trim());
    if (cells.length < 5) {
      continue;
    }
    const [rawInput, , , rawHash, rawIndex] = cells;
    rows.push({
      input: decodeCell(rawInput),
      hash: decodeCell(rawHash).toLowerCase(),
      index: parseInt(rawIndex, 10),
    });
  }
  return rows;
}

function decodeCell(cell: string): string {
  if (cell.startsWith("`") && cell.endsWith("`")) {
    return cell.slice(1, -1);
  }
  return cell;
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) {
    return [];
  }
  let inCode = false;
  let current = "";
  const cells: string[] = [];
  for (let i = 1; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === "`") {
      inCode = !inCode;
      current += char;
      continue;
    }
    if (char === "|" && !inCode) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  return cells;
}
