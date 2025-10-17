declare module "estree" {
  interface BaseNode {
    readonly type: string;
  }

  export type Node = BaseNode;
}
