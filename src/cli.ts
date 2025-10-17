#!/usr/bin/env node
import { Cat32 } from "./categorizer.js";

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
]);

type ParsedArgs = Record<string, string | boolean | undefined> & {
  _: string | undefined;
  salt?: string;
  namespace?: string;
  normalize?: string;
  json?: string;
  pretty?: boolean;
};

type OutputFormat = "compact" | "pretty";

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
        let value: string;
        if (eq >= 0) {
          value = a.slice(eq + 1);
        } else {
          const next = argv[i + 1];
          if (
            next !== undefined &&
            next !== "--" &&
            !next.startsWith("--") &&
            (spec.allowedValues === undefined || spec.allowedValues.includes(next))
          ) {
            value = next;
            i += 1;
          } else {
            value = spec.defaultValue;
          }
        }
        args[key] = value;
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

async function main() {
  const args = parseArgs(process.argv);
  const key = args._;
  const salt = typeof args.salt === "string" ? args.salt : "";
  const namespace = typeof args.namespace === "string" ? args.namespace : "";
  const norm = typeof args.normalize === "string" ? args.normalize : "nfkc";

  const cat = new Cat32({ salt, namespace, normalize: norm as any });

  const shouldReadFromStdin = key === undefined;
  const input = shouldReadFromStdin ? await readStdin() : key;
  const res = cat.assign(input);
  const format = resolveOutputFormat(args);
  const indent = format === "pretty" ? 2 : 0;
  process.stdout.write(JSON.stringify(res, null, indent) + "\n");
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

function readStdin(): Promise<string> {
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
      let finalData = data;
      if (finalData.endsWith("\r\n")) {
        finalData = finalData.slice(0, -2);
      } else if (finalData.endsWith("\n")) {
        finalData = finalData.slice(0, -1);
      }
      resolve(finalData);
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
