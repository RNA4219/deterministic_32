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
  const candidatePaths = path.isAbsolute(argument)
    ? [argument]
    : [path.resolve(process.cwd(), argument), path.resolve(projectRoot, argument)];

  let matchedAbsolutePath = null;
  let projectRelativePath = null;

  for (const candidate of candidatePaths) {
    const relative = path.relative(projectRoot, candidate);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      continue;
    }

    if (fs.existsSync(candidate)) {
      matchedAbsolutePath = candidate;
      projectRelativePath = relative;
      break;
    }

    if (matchedAbsolutePath === null) {
      matchedAbsolutePath = candidate;
      projectRelativePath = relative;
    }
  }

  if (matchedAbsolutePath === null || projectRelativePath === null) {
    return argument;
  }

  if (projectRelativePath.endsWith(".ts")) {
    const withoutExtension = projectRelativePath.slice(0, -3);
    const mapped = path.join(projectRoot, "dist", `${withoutExtension}.js`);
    return mapped;
  }

  if (fs.existsSync(matchedAbsolutePath)) {
    try {
      if (fs.statSync(absolutePath).isDirectory()) {
        if (
          projectRelativePath === "dist" ||
          projectRelativePath.startsWith(`dist${path.sep}`)
        ) {
          return argument;
        }

        const mappedDirectory = path.join(
          projectRoot,
          "dist",
          projectRelativePath,
        );
        return mappedDirectory;
      }
    } catch {
      // ignore errors and fall through to original argument
    }
  }

  return argument;
};

const flagsWithValues = new Set([
  "--test-name-pattern",
  "--test-reporter",
  "--test-reporter-destination",
]);

const cliArguments = process.argv.slice(2);
const optionArguments = [];
const targetArguments = [];
let expectingValueForFlag = false;

for (const argument of cliArguments) {
  if (argument === "--") {
    continue;
  }

  if (expectingValueForFlag) {
    optionArguments.push(argument);
    expectingValueForFlag = false;
    continue;
  }

  if (argument.startsWith("--")) {
    const [flagName, inlineValue] = argument.split("=", 2);
    optionArguments.push(argument);
    if (flagsWithValues.has(flagName) && inlineValue === undefined) {
      expectingValueForFlag = true;
    }
    continue;
  }

  const mappedArgument = mapArgument(argument);
  targetArguments.push(mappedArgument);
}

const hasCliTargets = targetArguments.length > 0;

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
  ? ["--test", ...optionArguments, ...targetArguments]
  : ["--test", ...optionArguments, ...defaultTargets];

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
