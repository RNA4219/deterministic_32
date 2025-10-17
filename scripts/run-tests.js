import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const defaultTargets = ["dist/tests", "dist/frontend/tests"];

const mapArgument = (argument) => {
  if (!argument.endsWith(".ts")) {
    return argument;
  }

  const withoutExtension = argument.slice(0, -3);
  const mapped = path.join("dist", `${withoutExtension}.js`);
  return mapped;
};

const extraTargets = process.argv.slice(2).map(mapArgument);

const child = spawn(process.execPath, ["--test", ...defaultTargets, ...extraTargets], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  throw error;
});
