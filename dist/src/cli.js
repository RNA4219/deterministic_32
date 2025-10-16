#!/usr/bin/env node
import { Cat32 } from "./categorizer.js";
function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--") {
            const rest = argv.slice(i + 1);
            if (rest.length > 0) {
                const remainder = rest.join(" ");
                if (Object.prototype.hasOwnProperty.call(args, "_")) {
                    args._ = `${args._} ${remainder}`;
                }
                else {
                    args._ = remainder;
                }
            }
            break;
        }
        if (a.startsWith("--")) {
            const eq = a.indexOf("=");
            if (eq >= 0) {
                args[a.slice(2, eq)] = a.slice(eq + 1);
            }
            else {
                const key = a.slice(2);
                const next = argv[i + 1];
                if (next !== undefined && next !== "--" && !next.startsWith("--")) {
                    args[key] = next;
                    i += 1;
                }
                else {
                    args[key] = true;
                }
            }
        }
        else if (!("_" in args)) {
            args._ = a;
        }
        else {
            args._ = String(args._ + " " + a);
        }
    }
    return args;
}
async function main() {
    const args = parseArgs(process.argv);
    const key = Object.prototype.hasOwnProperty.call(args, "_")
        ? (args._)
        : undefined;
    const salt = args.salt ?? "";
    const namespace = args.namespace ?? "";
    const norm = args.normalize ?? "nfkc";
    const cat = new Cat32({ salt, namespace, normalize: norm });
    const shouldReadFromStdin = key === undefined;
    const input = shouldReadFromStdin ? await readStdin() : key;
    const res = cat.assign(input);
    process.stdout.write(JSON.stringify(res) + "\n");
}
function readStdin() {
    return new Promise((resolve) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => (data += chunk));
        process.stdin.on("end", () => {
            let finalData = data;
            if (finalData.endsWith("\r\n")) {
                finalData = finalData.slice(0, -2);
            }
            else if (finalData.endsWith("\n")) {
                finalData = finalData.slice(0, -1);
            }
            resolve(finalData);
        });
    });
}
const SPEC_VIOLATION_MESSAGE_FRAGMENTS = [
    "cyclic object",
    "override label",
    "index out of range",
];
function isSpecificationViolation(error) {
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
}
catch (error) {
    if (error instanceof Error) {
        console.error(error);
    }
    else {
        console.error(new Error(String(error)));
    }
    const exitCode = isSpecificationViolation(error) ? 2 : 1;
    process.exit(exitCode);
}
