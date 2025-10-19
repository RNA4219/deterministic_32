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

const testSegmentPattern = /^(?:tests|__tests__)$|(?:\.spec(?:\.[^.]+)?$)|(?:\.test(?:\.[^.]+)?$)/u;

const mapArgument = (argument) => {
  if (argument.startsWith("--")) {
    return { value: argument, isTarget: false };
  }

  const candidatePaths = path.isAbsolute(argument)
    ? [argument]
    : [path.resolve(process.cwd(), argument), path.resolve(projectRoot, argument)];

  let matchedAbsolutePath = null;
  let projectRelativePath = null;
  let matchedPathExists = false;

  for (const candidate of candidatePaths) {
    const relative = path.relative(projectRoot, candidate);
    if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
      continue;
    }

    if (fs.existsSync(candidate)) {
      matchedAbsolutePath = candidate;
      projectRelativePath = relative;
      matchedPathExists = true;
      break;
    }

    if (matchedAbsolutePath === null) {
      matchedAbsolutePath = candidate;
      projectRelativePath = relative;
    }
  }

  if (matchedAbsolutePath === null || projectRelativePath === null) {
    return { value: argument, isTarget: false };
  }

  const pathSegments = projectRelativePath.split(path.sep);
  const hasTestSegment = pathSegments.some((segment) => testSegmentPattern.test(segment));

  if (!hasTestSegment) {
    return { value: argument, isTarget: false };
  }

  if (projectRelativePath.endsWith(".ts")) {
    const withoutExtension = projectRelativePath.slice(0, -3);
    const mapped = path.join(projectRoot, "dist", `${withoutExtension}.js`);
    return { value: mapped, isTarget: true };
  }

  if (matchedPathExists) {
    try {
      if (fs.statSync(matchedAbsolutePath).isDirectory()) {
        if (
          projectRelativePath === "dist" ||
          projectRelativePath.startsWith(`dist${path.sep}`)
        ) {
          return { value: argument, isTarget: true };
        }

        const mappedDirectory = path.join(
          projectRoot,
          "dist",
          projectRelativePath,
        );
        return { value: mappedDirectory, isTarget: true };
      }
    } catch {
      // ignore errors and fall through to original argument
    }
  }

  return { value: argument, isTarget: true };
};

const cliArguments = process.argv.slice(2);
const filteredCliArguments = cliArguments.filter((argument) => argument !== "--");
const mappedArguments = filteredCliArguments.map(mapArgument);
const extraTargets = mappedArguments.map((entry) => entry.value);
const hasExplicitTargets = mappedArguments.some((entry) => entry.isTarget);

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

const nodeTestArgs = hasExplicitTargets
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
