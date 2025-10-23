#!/usr/bin/env node
import { Cat32, type NormalizeMode } from "./categorizer.js";

type FlagSpec =
  | { mode: "value" }
  | { mode: "optional-value"; defaultValue: string; allowedValues?: readonly string[] }
  | { mode: "boolean" };

const FLAG_SPECS = new Map<string, FlagSpec>([
  ["salt", { mode: "value" }],
  ["namespace", { mode: "value" }],
  ["normalize", { mode: "value" }],
  [
    "json",
    { mode: "optional-value", defaultValue: "compact", allowedValues: ["compact", "pretty"] },
  ],
  ["pretty", { mode: "boolean" }],
  ["help", { mode: "boolean" }],
]);

const HELP_TEXT = [
  "Usage: cat32 [options] [input]",
  "",
  "Options:",
  "  --salt <value>           Salt to apply when assigning a category.",
  "  --namespace <value>      Namespace that scopes generated categories.",
  "  --normalize <value>      Unicode normalization form (none|nfc|nfd|nfkc|nfkd; default: nfkc).",
  "  --json [format]          Output JSON format: compact or pretty (default: compact).",
  "  --pretty                 Shorthand for --json pretty.",
  "  --help                   Show this help message and exit.",
  "",
].join("\n");

type ParsedArgs = Record<string, string | boolean | undefined> & {
  _: string | undefined;
  salt?: string;
  namespace?: string;
  normalize?: string;
  json?: string;
  pretty?: boolean;
  help?: boolean;
};

type OutputFormat = "compact" | "pretty";

function assertAllowedFlagValue(
  key: string,
  value: string,
  allowedValues: readonly string[] | undefined,
): void {
  if (allowedValues !== undefined && !allowedValues.includes(value)) {
    throw new RangeError(`unsupported --${key} value "${value}"`);
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: Record<string, string | boolean | undefined> = {};
  let positional: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      const rest = argv.slice(i + 1);
      if (rest.length > 0) {
        const remainder = rest.join(" ");
        positional = positional === undefined ? remainder : `${positional} ${remainder}`;
      }
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const key = a.slice(2, eq >= 0 ? eq : undefined);
      const spec = FLAG_SPECS.get(key);
      if (spec === undefined) {
        throw new RangeError(`unknown flag "--${key}"`);
      }
      if (spec.mode === "boolean") {
        if (eq >= 0) {
          throw new RangeError(`flag "${a}" does not accept a value`);
        }
        args[key] = true;
      } else if (spec.mode === "optional-value") {
        if (eq >= 0) {
          const explicitValue = a.slice(eq + 1);
          assertAllowedFlagValue(key, explicitValue, spec.allowedValues);
          args[key] = explicitValue;
          continue;
        }

        const next = argv[i + 1];

        if (next === undefined || next === "--" || next.startsWith("--")) {
          args[key] = spec.defaultValue;
          continue;
        }

        assertAllowedFlagValue(key, next, spec.allowedValues);
        args[key] = next;
        i += 1;
      } else {
        let value: string | undefined;
        if (eq >= 0) {
          value = a.slice(eq + 1);
        } else {
          const next = argv[i + 1];
          if (next !== undefined && next !== "--" && !next.startsWith("--")) {
            value = next;
            i += 1;
          } else {
            throw new RangeError(`flag "${a}" requires a value`);
          }
        }
        args[key] = value;
      }
    } else if (positional === undefined) {
      positional = a;
    } else {
      positional = `${positional} ${a}`;
    }
  }
  return Object.assign(args, { _: positional }) as ParsedArgs;
}

function parseNormalizeOption(value: string | undefined): NormalizeMode {
  if (value === undefined) {
    return "nfkc";
  }
  if (value === "none" || value === "nfc" || value === "nfd" || value === "nfkc" || value === "nfkd") {
    return value;
  }
  throw new RangeError("normalize must be one of \"none\", \"nfc\", \"nfd\", \"nfkc\", or \"nfkd\"");
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help === true) {
    process.stdout.write(HELP_TEXT);
    return;
  }
  const key = args._;
  const salt = typeof args.salt === "string" ? args.salt : "";
  const namespace = typeof args.namespace === "string" ? args.namespace : undefined;
  const normalize = parseNormalizeOption(
    typeof args.normalize === "string" ? args.normalize : undefined,
  );

  const cat = new Cat32({ salt, namespace, normalize });

  const shouldReadFromStdin = key === undefined;
  const input = shouldReadFromStdin ? await readStdin() : key;
  const res = cat.assign(input);
  const normalizedKey = normalizeCanonicalKey(res.key);
  const outputRecord =
    normalizedKey === res.key ? res : { ...res, key: normalizedKey };
  const format = resolveOutputFormat(args);
  const indent = format === "pretty" ? 2 : 0;
  process.stdout.write(JSON.stringify(outputRecord, null, indent) + "\n");
}

function resolveOutputFormat(args: ParsedArgs): OutputFormat {
  const jsonOption = typeof args.json === "string" ? args.json : undefined;
  const prettyFlag = args.pretty === true;
  if (jsonOption === undefined) {
    return prettyFlag ? "pretty" : "compact";
  }
  if (jsonOption === "compact" || jsonOption === "pretty") {
    if (prettyFlag) {
      return "pretty";
    }
    return jsonOption;
  }
  throw new RangeError(`unsupported --json value "${jsonOption}"`);
}

type ReadableStdin = typeof process.stdin & {
  setEncoding(encoding: string): void;
  addListener(event: "data", listener: (chunk: string) => void): void;
  addListener(event: "end" | "close", listener: () => void): void;
  addListener(event: "error", listener: (error: unknown) => void): void;
  removeListener(event: "data", listener: (chunk: string) => void): void;
  removeListener(event: "end" | "close", listener: () => void): void;
  removeListener(event: "error", listener: (error: unknown) => void): void;
};

type ReadStdinOptions = {
  preserveTrailingNewline?: boolean;
};

function readStdin(options: ReadStdinOptions = {}): Promise<string> {
  const { preserveTrailingNewline } = options;
  const shouldPreserveTrailingNewline = preserveTrailingNewline ?? false;
  return new Promise((resolve, reject) => {
    const stdin = process.stdin as ReadableStdin;
    let data = "";
    let settled = false;
    stdin.setEncoding("utf8");

    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.removeListener("end", onEnd);
      stdin.removeListener("close", onClose);
      stdin.removeListener("error", onError);
    }

    function resolveWithData() {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (shouldPreserveTrailingNewline) {
        resolve(data);
        return;
      }
      const trimmed = data.replace(/(?:\r?\n)+$/gu, "");
      resolve(trimmed);
    }

    function onData(chunk: string) {
      data += chunk;
    }

    function onEnd() {
      resolveWithData();
    }

    function onClose() {
      resolveWithData();
    }

    function onError(error: unknown) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    }

    stdin.addListener("data", onData);
    stdin.addListener("end", onEnd);
    stdin.addListener("close", onClose);
    stdin.addListener("error", onError);
  });
}

function normalizeCanonicalKey(key: string): string {
  let normalized = "";
  let backslashRunLength = 0;

  for (let index = 0; index < key.length; index += 1) {
    const char = key[index];

    if (char === "\\") {
      backslashRunLength += 1;
      continue;
    }

    if ((char === "n" || char === "r") && backslashRunLength > 0) {
      const literalPairs = Math.trunc(backslashRunLength / 2);
      if (literalPairs > 0) {
        normalized += "\\".repeat(literalPairs);
      }
      if (backslashRunLength % 2 === 1) {
        normalized += char === "n" ? "\n" : "\r";
        backslashRunLength = 0;
        continue;
      }
      normalized += char;
      backslashRunLength = 0;
      continue;
    }

    if (backslashRunLength > 0) {
      normalized += "\\".repeat(backslashRunLength);
      backslashRunLength = 0;
    }
    normalized += char;
  }

  if (backslashRunLength > 0) {
    normalized += "\\".repeat(backslashRunLength);
  }

  return normalized;
}

const SPEC_VIOLATION_MESSAGE_FRAGMENTS = [
  "cyclic object",
  "override label",
  "index out of range",
] as const;

function isSpecificationViolation(error: unknown): boolean {
  if (error instanceof RangeError) {
    return true;
  }
  if (error instanceof Error) {
    const message = String(error.message ?? "").toLowerCase();
    if (SPEC_VIOLATION_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment))) {
      return true;
    }
  }
  return false;
}

try {
  await main();
} catch (error) {
  if (error instanceof Error) {
    console.error(error);
  } else {
    console.error(new Error(String(error)));
  }
  const exitCode = isSpecificationViolation(error) ? 2 : 1;
  process.exit(exitCode);
}
