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
    : [
        path.resolve(projectRoot, argument),
        path.resolve(process.cwd(), argument),
      ];

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

const flagsWithValues = new Set([
  "--test-name-pattern",
  "--test-reporter",
  "--test-reporter-destination",
]);

const cliArguments = process.argv.slice(2);
const filteredCliArguments = cliArguments.filter((argument) => argument !== "--");
const mappedArguments = [];
let expectValueForFlag = false;

for (const argument of filteredCliArguments) {
  if (expectValueForFlag) {
    mappedArguments.push({ value: argument, isTarget: false });
    expectValueForFlag = false;
    continue;
  }

  const mapped = mapArgument(argument);
  mappedArguments.push(mapped);

  if (!mapped.isTarget && flagsWithValues.has(argument)) {
    expectValueForFlag = true;
  }
}

const flagArguments = [];
const targetArguments = [];

for (const entry of mappedArguments) {
  if (entry.isTarget) {
    targetArguments.push(entry.value);
  } else {
    flagArguments.push(entry.value);
  }
}

const effectiveTargets =
  targetArguments.length > 0 ? targetArguments : [...defaultTargets];

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

const nodeTestArgs = [
  "--test",
  ...flagArguments,
  ...effectiveTargets,
];

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
