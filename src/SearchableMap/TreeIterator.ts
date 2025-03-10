import type { Entry, LeafType, RadixTree } from "./typings.js";

export const ENTRIES = "ENTRIES";

export const KEYS = "KEYS";

export const VALUES = "VALUES";

export const LEAF = "" as LeafType;

interface Iterators<T> {
  ENTRIES: Entry<T>;
  KEYS: string;
  VALUES: T;
}

type Kind<T> = keyof Iterators<T>;
type Result<T, K extends keyof Iterators<T>> = Iterators<T>[K];

type IteratorPath<T> = {
  node: RadixTree<T>;
  keys: string[];
}[];

export interface IterableSet<T> {
  _tree: RadixTree<T>;
  _prefix: string;
}

/**
 * @private
 */
export class TreeIterator<T, K extends Kind<T>>
  implements Iterator<Result<T, K>>
{
  set: IterableSet<T>;
  _type: K;
  _path: IteratorPath<T>;

  constructor(set: IterableSet<T>, type: K) {
    const node = set._tree;
    const keys = Array.from(node.keys());

    this.set = set;
    this._type = type;
    this._path = keys.length > 0 ? [{ node, keys }] : [];
  }

  next(): IteratorResult<Result<T, K>> {
    const value = this.dive();

    this.backtrack();

    return value;
  }

  dive(): IteratorResult<Result<T, K>> {
    if (this._path.length === 0) return { done: true, value: undefined };

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { node, keys } = last(this._path)!;

    if (last(keys) === LEAF) return { done: false, value: this.result() };

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const child = node.get(last(keys)!)!;

    this._path.push({ node: child, keys: Array.from(child.keys()) });

    return this.dive();
  }

  backtrack(): void {
    if (this._path.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const keys = last(this._path)!.keys;

    keys.pop();
    if (keys.length > 0) return;

    this._path.pop();
    this.backtrack();
  }

  key(): string {
    return (
      this.set._prefix +
      this._path
        .map(({ keys }) => last(keys))
        .filter((key) => key !== LEAF)
        .join("")
    );
  }

  value(): T {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return last(this._path)!.node.get(LEAF)!;
  }

  result(): Result<T, K> {
    switch (this._type) {
      case VALUES:
        return this.value() as Result<T, K>;
      case KEYS:
        return this.key() as Result<T, K>;
      default:
        return [this.key(), this.value()] as Result<T, K>;
    }
  }

  [Symbol.iterator](): this {
    return this;
  }
}

const last = <T>(array: T[]): T | undefined => {
  return array[array.length - 1];
};
