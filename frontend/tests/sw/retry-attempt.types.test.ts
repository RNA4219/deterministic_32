import type { RetryAttempt } from "../../src/sw.js";

const acceptsPromiseReturningValue: RetryAttempt = async () => {
  return new Response("ok");
};

const acceptsSynchronousValue: RetryAttempt = () => new Response("ok");

