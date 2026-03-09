import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

class BuildError extends Error {
  exitCode;

  constructor(message, { cause, exitCode } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'BuildError';
    this.exitCode = typeof exitCode === 'number' ? exitCode : 1;
  }
}

function formatError(error) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

function normalizeExitCode(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return 1;
}

function handleFatalError(error) {
  const exitCode = normalizeExitCode(
    error && typeof error === 'object' && 'exitCode' in error
      ? error.exitCode
      : undefined,
  );

  console.error(
    `[build] failed (exit code ${exitCode}): ${formatError(error)}`,
  );
  process.exit(exitCode);
}

process.on('unhandledRejection', (error) => {
  handleFatalError(error);
});

process.on('uncaughtException', (error) => {
  handleFatalError(error);
});

function getForwardedArgs() {
  return process.argv.slice(2);
}

function shouldCleanDist() {
  return process.env.CAT32_SKIP_DIST_CLEAN !== '1';
}

function cleanDist() {
  if (!shouldCleanDist()) {
    return;
  }

  rmSync(resolve('dist'), { recursive: true, force: true });
}

function runTypeScriptBuild() {
  const tscPath = resolve('node_modules', 'typescript', 'bin', 'tsc');
  const forwardedArgs = getForwardedArgs();
  const tscArgs = ['-p', 'tsconfig.json', ...forwardedArgs];
  const result = spawnSync(process.execPath, [tscPath, ...tscArgs], {
    stdio: 'inherit',
  });

  if (result.error) {
    throw new BuildError('Failed to execute TypeScript compiler', {
      cause: result.error,
      exitCode: result.status ?? 1,
    });
  }

  if (typeof result.status === 'number') {
    if (result.status !== 0) {
      throw new BuildError('TypeScript compilation failed', {
        exitCode: result.status,
      });
    }

    return;
  }

  const reason =
    typeof result.signal === 'string' && result.signal.length > 0
      ? `TypeScript compilation terminated by signal ${result.signal}`
      : 'TypeScript compilation failed for an unknown reason';

  throw new BuildError(reason, { exitCode: 1 });
}

function shouldCopyFile(source) {
  return source.endsWith('.js') || source.endsWith('.d.ts');
}

function copyEntry(source, destination) {
  let stats;
  try {
    stats = statSync(source);
  } catch {
    return;
  }

  if (stats.isDirectory()) {
    mkdirSync(destination, { recursive: true });

    let entries;
    try {
      entries = readdirSync(source);
    } catch {
      return;
    }

    for (const entry of entries) {
      copyEntry(join(source, entry), join(destination, entry));
    }
    return;
  }

  if (!shouldCopyFile(source)) {
    return;
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function copyCompiledSources() {
  const dist = resolve('dist');
  const srcRoot = join(dist, 'src');

  if (!existsSync(srcRoot)) {
    return;
  }

  for (const entry of readdirSync(srcRoot)) {
    copyEntry(join(srcRoot, entry), join(dist, entry));
  }
}

function installJsonReporter() {
  const reporterSrc = resolve('reporters', 'json');
  const reporterDest = resolve('node_modules', 'json');

  rmSync(reporterDest, { recursive: true, force: true });
  mkdirSync(reporterDest, { recursive: true });

  for (const filename of ['index.js', 'package.json']) {
    copyFileSync(join(reporterSrc, filename), join(reporterDest, filename));
  }
}

function main() {
  try {
    cleanDist();
    runTypeScriptBuild();
    copyCompiledSources();
    installJsonReporter();
  } catch (error) {
    handleFatalError(error);
  }
}

main();