import test from "node:test";
import assert from "node:assert/strict";

let strictWeakRefReloadSequence = 0;

test(
  "dist の stableStringify は StrictWeakRef/StrictFinalizationRegistry 下でも 2 度のローカル Symbol シリアライズに成功する",
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
      const relative = import.meta.url.includes("/dist/tests/")
        ? "../../../dist/serialize.js"
        : "../../dist/serialize.js";
      const specifier = `${relative}?strict-weakref=${strictWeakRefReloadSequence}`;
      strictWeakRefReloadSequence += 1;
      const { stableStringify } = await import(
        new URL(specifier, import.meta.url).href,
      );

      const symbol = Symbol("weakref");

      try {
        stableStringify(symbol);
        stableStringify(symbol);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert.ok(false, message);
      }
    } finally {
      strictWeakRefReloadSequence += 1;
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
