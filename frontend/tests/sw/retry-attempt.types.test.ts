import type { RetryAttempt } from "../../src/sw.js";

const acceptsPromiseReturningValue: RetryAttempt = async () => {
  return "ok";
};

const acceptsSynchronousValue: RetryAttempt = () => "ok";
