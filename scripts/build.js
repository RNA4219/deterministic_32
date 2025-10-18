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
    throw result.error;
  }

  const exitCode = result.status ?? 1;
  if (exitCode !== 0) {
    process.exit(exitCode);
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
  runTypeScriptBuild();
  copyCompiledSources();
  installJsonReporter();
}

main();
