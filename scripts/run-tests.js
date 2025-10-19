import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const defaultTargets = ["dist/tests", "dist/frontend/tests"];

const projectRoot = process.cwd();

const mapArgument = (argument) => {
  if (!argument.endsWith(".ts")) {
    return argument;
  }

  const absolutePath = path.isAbsolute(argument)
    ? argument
    : path.resolve(projectRoot, argument);
  const relativePath = path.relative(projectRoot, absolutePath);
  const withoutExtension = relativePath.slice(0, -3);
  const mapped = path.join("dist", `${withoutExtension}.js`);
  return mapped;
};

const extraTargets = process.argv.slice(2).map(mapArgument);

const spawnOverride =
  typeof globalThis === "object" &&
  globalThis !== null &&
  typeof globalThis.__CAT32_TEST_SPAWN__ === "function"
    ? globalThis.__CAT32_TEST_SPAWN__
    : null;

const spawnImplementation = spawnOverride ?? spawn;

const child = spawnImplementation(
  process.execPath,
  ["--test", ...defaultTargets, ...extraTargets],
  {
    stdio: "inherit",
  },
);

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
