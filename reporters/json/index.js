import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const reporterUrl = pathToFileURL(join(here, "../../dist/tests/json-reporter.js"));
const modulePromise = import(reporterUrl.href);

const { default: JsonReporter, toSerializableEvent } = await modulePromise;

export default JsonReporter;
export { toSerializableEvent };
