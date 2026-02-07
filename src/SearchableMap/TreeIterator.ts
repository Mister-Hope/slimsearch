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
type Result<T, Key extends keyof Iterators<T>> = Iterators<T>[Key];

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
export class TreeIterator<T, Key extends Kind<T>> implements Iterator<Result<T, Key>> {
  set: IterableSet<T>;
  _type: Key;
  _path: IteratorPath<T>;

  constructor(set: IterableSet<T>, type: Key) {
    const node = set._tree;
    const keys = [...node.keys()];

    this.set = set;
    this._type = type;
    this._path = keys.length > 0 ? [{ node, keys }] : [];
  }

  next(): IteratorResult<Result<T, Key>> {
    const value = this.dive();

    this.backtrack();

    return value;
  }

  dive(): IteratorResult<Result<T, Key>> {
    // oxlint-disable-next-line no-undefined
    if (this._path.length === 0) return { done: true, value: undefined };

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { node, keys } = last(this._path)!;

    if (last(keys) === LEAF) return { done: false, value: this.result() };

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const child = node.get(last(keys)!)!;

    this._path.push({ node: child, keys: [...child.keys()] });

    return this.dive();
  }

  backtrack(): void {
    if (this._path.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { keys } = last(this._path)!;

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

  result(): Result<T, Key> {
    // oxlint-disable-next-line default-case
    switch (this._type) {
      case VALUES: {
        return this.value() as Result<T, Key>;
      }
      case KEYS: {
        return this.key() as Result<T, Key>;
      }
      case ENTRIES: {
        return [this.key(), this.value()] as Result<T, Key>;
      }
    }
  }

  [Symbol.iterator](): this {
    return this;
  }
}

const last = <T>(array: T[]): T | undefined => array[array.length - 1];
