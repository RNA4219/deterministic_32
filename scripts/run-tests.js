import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const defaultTargets = ["dist/tests", "dist/frontend/tests"];
const projectRootPath = process.cwd();

const mapArgument = (argument) => {
  if (!argument.endsWith(".ts")) {
    return argument;
  }

  const relativeArgument = path.isAbsolute(argument)
    ? path.relative(projectRootPath, argument)
    : argument;

  const withoutExtension = relativeArgument.slice(0, -3);
  const mapped = path.join("dist", `${withoutExtension}.js`);
  return mapped;
};

const extraTargets = process.argv.slice(2).map(mapArgument);

export const spawnTestProcess = (
  argv = process.argv,
  execPath = process.execPath,
  spawnImplementation = spawn,
) => {
  const extraTargets = argv.slice(2).map(mapArgument);
  return spawnImplementation(execPath, ["--test", ...defaultTargets, ...extraTargets], {
    stdio: "inherit",
  });
};

const invokedScriptPath = typeof process.argv[1] === "string" ? path.resolve(process.argv[1]) : null;
const currentScriptPath = path.resolve(fileURLToPath(import.meta.url));

if (invokedScriptPath && invokedScriptPath === currentScriptPath) {
  const child = spawnTestProcess();

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
}
