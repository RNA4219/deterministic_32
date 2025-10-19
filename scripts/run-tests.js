import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = scriptDirectory.endsWith(`${path.sep}dist${path.sep}scripts`)
  ? path.resolve(scriptDirectory, "..", "..")
  : path.resolve(scriptDirectory, "..");

const defaultTargets = [
  path.join(projectRoot, "dist", "tests"),
  path.join(projectRoot, "dist", "frontend", "tests"),
];

const mapArgument = (argument) => {
  const absolutePath = path.isAbsolute(argument)
    ? argument
    : path.resolve(projectRoot, argument);
  const projectRelativePath = path.relative(projectRoot, absolutePath);

  if (
    projectRelativePath === "" ||
    projectRelativePath.startsWith("..") ||
    path.isAbsolute(projectRelativePath)
  ) {
    return argument;
  }

  if (projectRelativePath.endsWith(".ts")) {
    const withoutExtension = projectRelativePath.slice(0, -3);
    const mapped = path.join(projectRoot, "dist", `${withoutExtension}.js`);
    return mapped;
  }

  if (fs.existsSync(absolutePath)) {
    try {
      if (fs.statSync(absolutePath).isDirectory()) {
        const mappedDirectory = path.join(projectRoot, "dist", projectRelativePath);
        if (fs.existsSync(mappedDirectory)) {
          return mappedDirectory;
        }
      }
    } catch {
      // ignore errors and fall through to original argument
    }
  }

  return argument;
};

const cliArguments = process.argv.slice(2);
const filteredCliArguments = cliArguments.filter((argument) => argument !== "--");
const extraTargets = filteredCliArguments.map(mapArgument);
const hasCliTargets = filteredCliArguments.some(
  (argument) => !argument.startsWith("--"),
);

const spawnOverride =
  typeof globalThis === "object" &&
  globalThis !== null &&
  typeof globalThis.__CAT32_TEST_SPAWN__ === "function"
    ? globalThis.__CAT32_TEST_SPAWN__
    : null;

const spawnImplementation = spawnOverride ?? spawn;

const spawnOptions = {
  cwd: projectRoot,
  stdio: "inherit",
};

const nodeTestArgs = hasCliTargets
  ? ["--test", ...extraTargets]
  : ["--test", ...defaultTargets, ...extraTargets];

const child = spawnImplementation(process.execPath, nodeTestArgs, spawnOptions);

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
