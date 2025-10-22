import test from "node:test";
import assert from "node:assert/strict";

import {
  stableStringify,
} from "../../src/index.js";
import {
  __getLocalSymbolSentinelRecordForTest,
  __peekLocalSymbolSentinelRecordForTest,
} from "../../src/serialize.js";

let weakRefReloadSequence = 0;

test(
  "WeakRef 定義環境でローカルシンボルの stringify が 2 回とも成功する",
  async () => {
    if (
      typeof globalThis.WeakRef !== "function" ||
      typeof globalThis.FinalizationRegistry !== "function"
    ) {
      return;
    }

    const originalWeakRef = globalThis.WeakRef;
    const originalFinalizationRegistry = globalThis.FinalizationRegistry;

    class StrictWeakRef<T extends object> {
      #inner: WeakRef<T>;

      constructor(target: T) {
        if (
          (typeof target !== "object" || target === null) &&
          typeof target !== "function"
        ) {
          throw new TypeError("WeakRef target must be an object");
        }

        this.#inner = new originalWeakRef(target);
      }

      deref(): T | undefined {
        return this.#inner.deref();
      }
    }

    class StrictFinalizationRegistry<T> {
      #registry: FinalizationRegistry<T>;

      constructor(cleanup: (heldValue: T) => void) {
        this.#registry = new originalFinalizationRegistry(cleanup);
      }

      register(target: object, heldValue: T, unregisterToken?: object): void {
        if (
          (typeof target !== "object" || target === null) &&
          typeof target !== "function"
        ) {
          throw new TypeError("FinalizationRegistry target must be an object");
        }

        this.#registry.register(target, heldValue, unregisterToken);
      }

      unregister(unregisterToken: object): boolean {
        return this.#registry.unregister(unregisterToken);
      }
    }

    Object.defineProperty(globalThis, "WeakRef", {
      value: StrictWeakRef as unknown as typeof WeakRef,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "FinalizationRegistry", {
      value: StrictFinalizationRegistry as unknown as typeof FinalizationRegistry,
      configurable: true,
      writable: true,
    });

    try {
      const moduleSpecifier = `../../src/index.js?strict-weakref=${weakRefReloadSequence}`;
      weakRefReloadSequence += 1;
      const { stableStringify: strictStableStringify } = await import(moduleSpecifier);

      const symbol = Symbol("weakref");
      strictStableStringify(symbol);
      strictStableStringify(symbol);
    } finally {
      weakRefReloadSequence += 1;
      Object.defineProperty(globalThis, "WeakRef", {
        value: originalWeakRef,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, "FinalizationRegistry", {
        value: originalFinalizationRegistry,
        configurable: true,
        writable: true,
      });
    }
  },
);

test("ローカルシンボルのセンチネルレコードがキャッシュされる", () => {
  const local = Symbol("local sentinel");

  assert.equal(
    __peekLocalSymbolSentinelRecordForTest(local),
    undefined,
    "登録前はレコードが存在しない",
  );

  const firstRecord = __getLocalSymbolSentinelRecordForTest(local);

  assert.equal(typeof firstRecord.identifier, "string");
  assert.ok(firstRecord.identifier.length > 0);
  assert.equal(typeof firstRecord.sentinel, "string");

  const peekedRecord = __peekLocalSymbolSentinelRecordForTest(local);
  assert.equal(peekedRecord, firstRecord);

  const secondRecord = __getLocalSymbolSentinelRecordForTest(local);
  assert.equal(secondRecord, firstRecord);

  const sentinelFromRecord = firstRecord.sentinel;
  const sentinelFromStringify = JSON.parse(stableStringify(local));
  assert.equal(sentinelFromStringify, sentinelFromRecord);

  const sentinelFromStringifyAgain = JSON.parse(stableStringify(local));
  assert.equal(sentinelFromStringifyAgain, sentinelFromRecord);
});

test("ローカルシンボルのピークはレコードを生成しない", () => {
  const another = Symbol("local peek");

  assert.equal(
    __peekLocalSymbolSentinelRecordForTest(another),
    undefined,
    "ピークのみではレコードが生成されない",
  );

  assert.equal(
    __peekLocalSymbolSentinelRecordForTest(another),
    undefined,
    "複数回のピークでも生成されない",
  );

  const record = __getLocalSymbolSentinelRecordForTest(another);
  assert.equal(
    __peekLocalSymbolSentinelRecordForTest(another),
    record,
    "センチネル作成後は同一レコードを返す",
  );
});
