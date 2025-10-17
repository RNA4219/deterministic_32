import { Cat32 } from "../src/categorizer.js";
const performanceApi = (() => {
    const candidate = globalThis.performance;
    if (candidate &&
        typeof candidate === "object" &&
        typeof candidate.now === "function") {
        return candidate;
    }
    return { now: () => Date.now() };
})();
const TARGET_OPS_PER_SECOND = 300_000;
const WARMUP_OPERATIONS = 100_000;
const MEASURED_OPERATIONS = 1_000_000;
const SAMPLE_KEY_COUNT = 10_000;
const categorizer = new Cat32({ namespace: "bench", salt: "cat32" });
const sampleKeys = new Array(SAMPLE_KEY_COUNT);
for (let i = 0; i < SAMPLE_KEY_COUNT; i += 1) {
    sampleKeys[i] = `user:${i.toString(36)}-${(i * 2654435761) & 0xffffffff}`;
}
let checksum = 0;
for (let i = 0; i < WARMUP_OPERATIONS; i += 1) {
    const assignment = categorizer.assign(sampleKeys[i % SAMPLE_KEY_COUNT]);
    checksum ^= assignment.index;
}
const start = performanceApi.now();
for (let i = 0; i < MEASURED_OPERATIONS; i += 1) {
    const assignment = categorizer.assign(sampleKeys[i % SAMPLE_KEY_COUNT]);
    checksum ^= assignment.index;
}
const elapsedMs = performanceApi.now() - start;
const elapsedSeconds = elapsedMs / 1_000;
const opsPerSecond = MEASURED_OPERATIONS / elapsedSeconds;
const formattedOps = Math.round(opsPerSecond).toLocaleString("en-US");
const formattedElapsed = elapsedSeconds.toFixed(3);
console.log(`Cat32.assign throughput: ${formattedOps} ops/sec over ${MEASURED_OPERATIONS.toLocaleString("en-US")} ops (${formattedElapsed}s)`);
console.log(`checksum=${checksum.toString(16)}`);
if (opsPerSecond >= TARGET_OPS_PER_SECOND) {
    console.log(`PASS target ${TARGET_OPS_PER_SECOND.toLocaleString("en-US")} ops/sec`);
}
else {
    console.error(`FAIL target ${TARGET_OPS_PER_SECOND.toLocaleString("en-US")} ops/sec`);
    process.exitCode = 1;
}
