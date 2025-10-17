declare module "node:test" {
  type TestImplementation = () => Promise<void> | void;
  type TestOptions = {
    readonly timeout?: number;
    readonly skip?: boolean;
    readonly only?: boolean;
  };
  type TestFunction = (name: string, fn: TestImplementation, options?: TestOptions) => Promise<void>;
  const test: TestFunction & {
    only: TestFunction;
    skip: TestFunction;
  };
  export default test;
}
