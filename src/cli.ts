#!/usr/bin/env node
import { Cat32 } from "./categorizer.js";

function parseArgs(argv: string[]) {
  const args: Record<string, string | true> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) {
        args[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        args[a.slice(2)] = true;
      }
    } else if (!("_" in args)) {
      (args as any)._ = a;
    } else {
      (args as any)._ = String((args as any)._ + " " + a);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const key = Object.prototype.hasOwnProperty.call(args, "_")
    ? ((args as { _: string })._)
    : undefined;
  const salt = (args.salt as string) ?? "";
  const namespace = (args.namespace as string) ?? "";
  const norm = (args.normalize as string) ?? "nfkc";

  const cat = new Cat32({ salt, namespace, normalize: norm as any });
  if (key === undefined && process.stdin.isTTY) {
    console.error("Usage: cat32 <key> [--salt=... --namespace=... --normalize=nfkc|nfc|none]");
    process.exit(1);
  }

  const input = key ?? (await readStdin());
  const res = cat.assign(input);
  process.stdout.write(JSON.stringify(res) + "\n");
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      let finalData = data;
      if (finalData.endsWith("\r\n")) {
        finalData = finalData.slice(0, -2);
      } else if (finalData.endsWith("\n")) {
        finalData = finalData.slice(0, -1);
      }
      resolve(finalData);
    });
  });
}

function isSpecificationViolation(error: unknown): boolean {
  if (error instanceof RangeError) {
    return true;
  }
  if (error instanceof TypeError) {
    const message = String(error.message ?? "").toLowerCase();
    if (message.includes("cyclic object")) {
      return true;
    }
  }
  return false;
}

try {
  await main();
} catch (error) {
  console.error(error);
  const exitCode = isSpecificationViolation(error) ? 2 : 1;
  process.exit(exitCode);
}
