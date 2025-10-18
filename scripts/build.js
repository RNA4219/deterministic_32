import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

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

function handleFatalError(error) {
  const exitCode =
    error && typeof error === 'object' && 'exitCode' in error
      ? (error.exitCode ?? 1)
      : 1;

  console.error('[build] failed:', formatError(error));
  process.exit(typeof exitCode === 'number' ? exitCode : 1);
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

  const exitCode = result.status ?? 1;
  if (exitCode !== 0) {
    throw new BuildError('TypeScript compilation failed', { exitCode });
  }
}

function shouldCopy(source, srcRoot) {
  if (source === srcRoot) {
    return true;
  }

  const stats = statSync(source);
  if (stats.isDirectory()) {
    return true;
  }

  return source.endsWith('.js') || source.endsWith('.d.ts');
}

function copyCompiledSources() {
  const dist = resolve('dist');
  const srcRoot = join(dist, 'src');

  if (!existsSync(srcRoot)) {
    return;
  }

  cpSync(srcRoot, dist, {
    recursive: true,
    filter: (source) => shouldCopy(source, srcRoot),
  });
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
    runTypeScriptBuild();
    copyCompiledSources();
    installJsonReporter();
  } catch (error) {
    handleFatalError(error);
  }
}

main();
