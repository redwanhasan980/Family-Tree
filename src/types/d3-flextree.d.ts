// d3-flextree 2.x ships without types; only the parts the tree layout uses.
declare module 'd3-flextree' {
  export interface FlexNode<T> {
    data: T;
    /** Centre on the breadth axis. */
    x: number;
    /** Top on the depth axis. */
    y: number;
    depth: number;
    parent: FlexNode<T> | null;
    children?: FlexNode<T>[];
    each(fn: (node: FlexNode<T>) => void): this;
    descendants(): FlexNode<T>[];
  }

  export interface FlexLayout<T> {
    (root: FlexNode<T>): FlexNode<T>;
    hierarchy(data: T, children?: (datum: T) => readonly T[] | undefined): FlexNode<T>;
  }

  export function flextree<T>(options?: {
    nodeSize?: (node: FlexNode<T>) => [number, number];
    spacing?: number | ((a: FlexNode<T>, b: FlexNode<T>) => number);
    children?: (datum: T) => readonly T[] | undefined;
  }): FlexLayout<T>;
}
