import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const projectRoot = scriptDirectory.endsWith(`${path.sep}dist${path.sep}scripts`)
  ? path.resolve(scriptDirectory, "..", "..")
  : path.resolve(scriptDirectory, "..");

const defaultTargets = [
  path.join(projectRoot, "dist", "tests"),
  path.join(projectRoot, "dist", "frontend", "tests"),
];

const distDirectory = path.join(projectRoot, "dist");

const defaultSourceDirectories = Array.from(
  new Set(
    defaultTargets
      .map((target) => {
        const relativeFromDist = path.relative(distDirectory, target);

        if (
          relativeFromDist === "" ||
          relativeFromDist.startsWith("..") ||
          path.isAbsolute(relativeFromDist)
        ) {
          return null;
        }

        return path.join(projectRoot, relativeFromDist);
      })
      .filter((value) => value !== null),
  ),
);

const testSegmentPattern = /^(?:tests|__tests__)$|(?:\.spec(?:\.[^.]+)?$)|(?:\.test(?:\.[^.]+)?$)/u;

const testSkipPatternFlag = "--test-skip-pattern";

const mapArgument = (argument, options = {}) => {
  const { forceTarget = false } = options;

  const argumentSegments = argument
    .split(/[\\/]/u)
    .filter((segment) => segment !== "" && segment !== ".");
  const argumentLooksLikeTestTarget = argumentSegments.some((segment) =>
    testSegmentPattern.test(segment),
  );

  if (!forceTarget && argument.startsWith("--") && !argumentLooksLikeTestTarget) {
    return { value: argument, isTarget: false };
  }

  const candidatePaths = path.isAbsolute(argument)
    ? [argument]
    : (() => {
        const bases = [];
        const argumentContainsPathSeparator = /[\\/]/u.test(argument);

        if (!argumentContainsPathSeparator) {
          bases.push(...defaultSourceDirectories);
        }

        bases.push(projectRoot);
        bases.push(process.cwd());

        const seen = new Set();
        const resolvedCandidates = [];

        for (const base of bases) {
          const candidate = path.resolve(base, argument);
          if (seen.has(candidate)) {
            continue;
          }

          seen.add(candidate);
          resolvedCandidates.push(candidate);
        }

        return resolvedCandidates;
      })();

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
    return { value: argument, isTarget: forceTarget };
  }

  const pathSegments = projectRelativePath.split(path.sep);
  const hasTestSegment = pathSegments.some((segment) => testSegmentPattern.test(segment));

  if (!hasTestSegment) {
    return { value: argument, isTarget: forceTarget };
  }

  const mapTsTarget = (extension, replacement) => {
    const withoutExtension = projectRelativePath.slice(
      0,
      -extension.length,
    );
    const mapped = path.join(
      projectRoot,
      "dist",
      `${withoutExtension}${replacement}`,
    );
    return { value: mapped, isTarget: true };
  };

  if (projectRelativePath.endsWith(".cts")) {
    return mapTsTarget(".cts", ".cjs");
  }

  if (projectRelativePath.endsWith(".mts")) {
    return mapTsTarget(".mts", ".mjs");
  }

  if (projectRelativePath.endsWith(".ts")) {
    return mapTsTarget(".ts", ".js");
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
  "--conditions",
  "--env-file",
  "--eval",
  "--experimental-loader",
  "--experimental-specifier-resolution",
  "--import",
  "--input-type",
  "--loader",
  "--print",
  "--require",
  "--test-concurrency",
  "--test-name-pattern",
  "--test-ignore",
  "--test-match",
  "--test-ignore",
  "--test-runner",
  "--test-reporter",
  "--test-reporter-destination",
  testSkipPatternFlag,
  "--test-timeout",
  "--watch-path",
  "-i",
  "-r",
]);

const ensurePendingFlagConsumed = (
  pendingFlag,
  handleMissingFlagValue,
) => {
  if (pendingFlag === null) {
    return;
  }

  handleMissingFlagValue(pendingFlag);
};

export const createNodeTestInvocation = ({
  argv = process.argv.slice(2),
  setExitCode = (value) => {
    process.exitCode = value;
  },
} = {}) => {
  const cliArguments = [...argv];
  const mappedArguments = [];
  let pendingValueFlag = null;
  let forceTargetMode = false;
  let hasCliSentinel = false;

  const handleMissingFlagValue = (flag) => {
    setExitCode(2);
    throw new RangeError(`Missing value for ${flag}`);
  };

  for (const argument of cliArguments) {
    if (argument === "--") {
      ensurePendingFlagConsumed(pendingValueFlag, handleMissingFlagValue);
      pendingValueFlag = null;
      forceTargetMode = true;
      hasCliSentinel = true;
      continue;
    }

    if (pendingValueFlag !== null) {
      mappedArguments.push({ value: argument, isTarget: false });
      pendingValueFlag = null;
      continue;
    }

    if (flagsWithValues.has(argument)) {
      mappedArguments.push({ value: argument, isTarget: false });
      pendingValueFlag = argument;
      continue;
    }

    const mapped = mapArgument(argument, { forceTarget: forceTargetMode });
    mappedArguments.push(mapped);

    if (
      !forceTargetMode &&
      typeof mapped.value === "string" &&
      flagsWithValues.has(mapped.value)
    ) {
      pendingValueFlag = mapped.value;
    }
  }

  ensurePendingFlagConsumed(pendingValueFlag, handleMissingFlagValue);

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

  const nodeTestArgs = ["--test", ...flagArguments];

  if (hasCliSentinel) {
    nodeTestArgs.push("--");
  }

  nodeTestArgs.push(...effectiveTargets);

  return {
    command: process.execPath,
    args: nodeTestArgs,
    options: {
      cwd: projectRoot,
      stdio: "inherit",
    },
  };
};

export const runNodeTests = (options = {}) => {
  const {
    argv = process.argv.slice(2),
    spawn: spawnOverride,
    execPath = process.execPath,
    setExitCode = (value) => {
      process.exitCode = value;
    },
  } = options;

  const spawnOverrideFromGlobal =
    typeof globalThis === "object" &&
    globalThis !== null &&
    typeof globalThis.__CAT32_TEST_SPAWN__ === "function"
      ? globalThis.__CAT32_TEST_SPAWN__
      : null;

  const invocation = createNodeTestInvocation({ argv, setExitCode });

  const spawnImplementation =
    spawnOverride ?? spawnOverrideFromGlobal ?? spawn;

  const child = spawnImplementation(execPath, invocation.args, invocation.options);

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

  return child;
};

const entryScriptPath = path.resolve(process.argv[1] ?? "");
const hasSpawnOverride =
  typeof globalThis === "object" &&
  globalThis !== null &&
  typeof globalThis.__CAT32_TEST_SPAWN__ === "function";

if (entryScriptPath === scriptPath && !hasSpawnOverride) {
  runNodeTests();
}
