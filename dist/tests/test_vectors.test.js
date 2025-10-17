import test from "node:test";
import assert from "node:assert";
import { Cat32 } from "../src/index.js";
const dynamicImport = new Function("specifier", "return import(specifier);");
const TEST_VECTOR_DOC_PATH = import.meta.url.includes("/dist/tests/")
    ? new URL("../../docs/TEST_VECTORS.md", import.meta.url)
    : new URL("../docs/TEST_VECTORS.md", import.meta.url);
const testVectorsPromise = (async () => {
    const { readFile } = (await dynamicImport("node:fs/promises"));
    const markdown = await readFile(TEST_VECTOR_DOC_PATH.pathname, { encoding: "utf8" });
    return parseTables(markdown);
})();
const VECTOR_SUITES = [
    {
        heading: "Unsalted",
        description: "Cat32 matches documented unsalted vectors",
        options: {},
    },
    {
        heading: "Salted (salt=projX, namespace=v1)",
        description: "Cat32 matches documented salted vectors",
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
        const cat = new Cat32(suite.options);
        for (const vector of rows) {
            const assignment = cat.assign(vector.input);
            assert.equal(assignment.key, vector.normalizedKey, `key mismatch for input ${JSON.stringify(vector.input)}`);
            assert.equal(deriveSaltedKey(assignment.key, suite.options), vector.saltedKey, `salted key mismatch for input ${JSON.stringify(vector.input)}`);
            assert.equal(assignment.hash, vector.hash, `hash mismatch for input ${JSON.stringify(vector.input)}`);
            assert.equal(assignment.index, vector.index, `index mismatch for input ${JSON.stringify(vector.input)}`);
        }
    });
}
function parseTables(markdown) {
    const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]);
    const tables = new Map();
    for (const heading of headings) {
        tables.set(heading, parseTable(markdown, heading));
    }
    return tables;
}
function parseTable(markdown, heading) {
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
    const headerCells = splitMarkdownRow(lines[headerIndex]).map((cell) => cell.trim().toLowerCase());
    const columnIndex = new Map();
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
    const rows = [];
    for (let i = headerIndex + 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) {
            break;
        }
        const cells = splitMarkdownRow(line).map((cell) => cell.trim());
        if (cells.length < 5) {
            continue;
        }
        const rawInput = cells[columnIndex.get("input")];
        const rawNormalizedKey = cells[columnIndex.get("normalized")];
        const rawSaltedKey = cells[columnIndex.get("salted_key")];
        const rawHash = cells[columnIndex.get("hash_hex")];
        const rawIndex = cells[columnIndex.get("index")];
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
function decodeCell(cell) {
    if (cell.startsWith("`") && cell.endsWith("`")) {
        return cell.slice(1, -1);
    }
    return cell;
}
function unescapeInlineCode(value) {
    return value.replace(/\\`/g, "`").replace(/\\\"/g, '"');
}
function splitMarkdownRow(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
        return [];
    }
    let inCode = false;
    let current = "";
    const cells = [];
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
function deriveSaltedKey(key, options) {
    const baseSalt = options.salt ?? "";
    const namespaceSuffix = options.namespace ? `|ns:${options.namespace}` : "";
    const combined = `${baseSalt}${namespaceSuffix}`;
    return combined ? `${key}|salt:${combined}` : key;
}
