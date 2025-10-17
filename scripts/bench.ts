import { Cat32 } from "../src/categorizer.js";

interface PerformanceLike {
  now: () => number;
}

interface ProcessLike {
  exitCode: number | undefined;
}

declare const process: ProcessLike;

const performanceApi: PerformanceLike = (() => {
  const candidate = (globalThis as { performance?: unknown }).performance;
  if (
    candidate &&
    typeof candidate === "object" &&
    typeof (candidate as PerformanceLike).now === "function"
  ) {
    return candidate as PerformanceLike;
  }
  return { now: () => Date.now() };
})();

const TARGET_OPS_PER_SECOND = 300_000;
const WARMUP_OPERATIONS = 100_000;
const MEASURED_OPERATIONS = 1_000_000;
const SAMPLE_KEY_COUNT = 10_000;

const categorizer = new Cat32({ namespace: "bench", salt: "cat32" });

const createSampleKeys = (count: number): string[] => {
  const keys = new Array<string>(count);
  for (let index = 0; index < count; index += 1) {
    keys[index] = `user:${index.toString(36)}-${(index * 2654435761) & 0xffffffff}`;
  }
  return keys;
};

const sampleKeys = createSampleKeys(SAMPLE_KEY_COUNT);
const sampleKeyModulo = sampleKeys.length;

const assignMany = (iterations: number, initialChecksum: number): number => {
  let checksum = initialChecksum;
  for (let index = 0; index < iterations; index += 1) {
    const assignment = categorizer.assign(sampleKeys[index % sampleKeyModulo]);
    checksum ^= assignment.index;
  }
  return checksum;
};

let checksum = assignMany(WARMUP_OPERATIONS, 0);

const start = performanceApi.now();
checksum = assignMany(MEASURED_OPERATIONS, checksum);
const elapsedMs = performanceApi.now() - start;
const elapsedSeconds = elapsedMs / 1_000;
const opsPerSecond = MEASURED_OPERATIONS / elapsedSeconds;

const formattedOps = Math.round(opsPerSecond).toLocaleString("en-US");
const formattedElapsed = elapsedSeconds.toFixed(3);

console.log(`Cat32.assign throughput: ${formattedOps} ops/sec over ${MEASURED_OPERATIONS.toLocaleString("en-US")} ops (${formattedElapsed}s)`);
console.log(`checksum=${checksum.toString(16)}`);

if (opsPerSecond >= TARGET_OPS_PER_SECOND) {
  console.log(`PASS target ${TARGET_OPS_PER_SECOND.toLocaleString("en-US")} ops/sec`);
} else {
  console.error(`FAIL target ${TARGET_OPS_PER_SECOND.toLocaleString("en-US")} ops/sec`);
  process.exitCode = 1;
}
