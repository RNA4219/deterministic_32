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
  const key = (args._ as string) ?? "";
  const salt = (args.salt as string) ?? "";
  const namespace = (args.namespace as string) ?? "";
  const norm = (args.normalize as string) ?? "nfkc";

  const cat = new Cat32({ salt, namespace, normalize: norm as any });
  if (!key && process.stdin.isTTY) {
    console.error("Usage: cat32 <key> [--salt=... --namespace=... --normalize=nfkc|nfc|none]");
    process.exit(1);
  }

  const input = key || (await readStdin());
  const res = cat.assign(input);
  process.stdout.write(JSON.stringify(res) + "\n");
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
