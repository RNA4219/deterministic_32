import test from "node:test";
import assert from "node:assert";

import { Cat32, type CategorizerOptions } from "../src/index.js";

type VectorRow = {
  input: string;
  normalizedKey: string;
  saltedKey: string;
  hash: string;
  index: number;
};

type ParsedTables = Map<string, VectorRow[]>;

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
  return parseTables(markdown);
})();

const VECTOR_SUITES: readonly {
  heading: string;
  description: string;
  create: () => Cat32;
  options?: Pick<CategorizerOptions, "salt" | "namespace">;
}[] = [
  {
    heading: "Unsalted",
    description: "Cat32 matches documented unsalted vectors",
    create: () => new Cat32(),
  },
  {
    heading: "Salted (salt=projX, namespace=v1)",
    description: "Cat32 matches documented salted vectors",
    create: () => new Cat32({ salt: "projX", namespace: "v1" }),
    options: { salt: "projX", namespace: "v1" },
  },
];

for (const suite of VECTOR_SUITES) {
  test(suite.description, async () => {
    const tables = await testVectorsPromise;
    const rows = tables.get(suite.heading);
    if (!rows) {
      throw new Error(`table not found for heading: ${suite.heading}`);
    }
    const cat = suite.create();
    for (const vector of rows) {
      const assignment = cat.assign(vector.input);
      assert.equal(
        assignment.key,
        vector.normalizedKey,
        `key mismatch for input ${JSON.stringify(vector.input)}`,
      );
      assert.equal(
        deriveSaltedKey(assignment.key, suite.options),
        vector.saltedKey,
        `salted key mismatch for input ${JSON.stringify(vector.input)}`,
      );
      assert.equal(
        assignment.hash,
        vector.hash,
        `hash mismatch for input ${JSON.stringify(vector.input)}`,
      );
      assert.equal(
        assignment.index,
        vector.index,
        `index mismatch for input ${JSON.stringify(vector.input)}`,
      );
    }
  });
}

function parseTables(markdown: string): ParsedTables {
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
  const tables: ParsedTables = new Map();
  for (const heading of headings) {
    tables.set(heading, parseTable(markdown, heading));
  }
  return tables;
}

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
  const headerCells = splitMarkdownRow(lines[headerIndex]).map((cell) =>
    cell.trim().toLowerCase(),
  );
  const columnIndex = new Map<string, number>();
  headerCells.forEach((name, idx) => {
    if (name) {
      columnIndex.set(name, idx);
    }
  });
  const requiredColumns = ["input", "normalized", "salted_key", "hash_hex", "index"];
  for (const column of requiredColumns) {
    if (!columnIndex.has(column)) {
      throw new Error(`column \"${column}\" missing for heading: ${heading}`);
    }
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
    const rawInput = cells[columnIndex.get("input")!];
    const rawNormalizedKey = cells[columnIndex.get("normalized")!];
    const rawSaltedKey = cells[columnIndex.get("salted_key")!];
    const rawHash = cells[columnIndex.get("hash_hex")!];
    const rawIndex = cells[columnIndex.get("index")!];
    rows.push({
      input: decodeCell(rawInput),
      normalizedKey: unescapeInlineCode(decodeCell(rawNormalizedKey)),
      saltedKey: unescapeInlineCode(decodeCell(rawSaltedKey)),
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

function unescapeInlineCode(value: string): string {
  return value.replace(/\\`/g, "`").replace(/\\\"/g, '"');
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

function deriveSaltedKey(
  key: string,
  options?: Pick<CategorizerOptions, "salt" | "namespace">,
): string {
  const baseSalt = options?.salt ?? "";
  const namespaceValue =
    options?.namespace !== undefined && options.namespace !== ""
      ? options.namespace
      : undefined;

  if (!baseSalt && namespaceValue === undefined) {
    return key;
  }

  if (namespaceValue === undefined) {
    return `${key}|salt:${baseSalt}`;
  }

  const encoded = JSON.stringify([baseSalt, namespaceValue]);
  return `${key}|saltns:${encoded}`;
}
