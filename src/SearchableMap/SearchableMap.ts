// oxlint-disable typescript/no-explicit-any
// oxlint-disable no-undefined
import { ENTRIES, KEYS, LEAF, TreeIterator, VALUES } from "./TreeIterator.js";
import { fuzzySearch } from "./fuzzySearch.js";
import type { Entry, FuzzyResults, Path, RadixTree } from "./typings.js";

/**
 * A class implementing the same interface as a standard JavaScript
 * [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
 * with string keys, but adding support for efficiently searching entries with
 * prefix or fuzzy search. This class is used internally by {@link SearchIndex} as
 * the inverted index data structure. The implementation is a radix tree
 * (compressed prefix tree).
 *
 * Since this class can be of general utility beyond _SlimSearch_, it is
 * exported by the `slimsearch` package and can be imported (or required) as
 * `slimsearch/SearchableMap`.
 *
 * @typeParam Value The type of the values stored in the map.
 */
export class SearchableMap<Value = any> {
  /**
   * @ignore
   */
  _tree: RadixTree<Value>;

  /**
   * @ignore
   */
  _prefix: string;

  private _size: number | undefined = undefined;

  /**
   * The constructor is normally called without arguments, creating an empty
   * map. In order to create a {@link SearchableMap} from an iterable or from an
   * object, check {@link SearchableMap.from} and {@link SearchableMap.fromObject}.
   *
   * The constructor arguments are for internal use, when creating derived
   * mutable views of a map at a prefix.
   */
  constructor(tree: RadixTree<Value> = new Map(), prefix = "") {
    this._tree = tree;
    this._prefix = prefix;
  }

  /**
   * Creates and returns a mutable view of this {@link SearchableMap}, containing only
   * entries that share the given prefix.
   *
   * ### Usage:
   *
   * ```js
   * const map = new SearchableMap()
   * map.set("unicorn", 1)
   * map.set("universe", 2)
   * map.set("university", 3)
   * map.set("unique", 4)
   * map.set("hello", 5)
   *
   * const uni = map.atPrefix("uni")
   * uni.get("unique") // => 4
   * uni.get("unicorn") // => 1
   * uni.get("hello") // => undefined
   *
   * const univer = map.atPrefix("univer")
   * univer.get("unique") // => undefined
   * univer.get("universe") // => 2
   * univer.get("university") // => 3
   * ```
   *
   * @param prefix  The prefix
   * @returns A {@link SearchableMap} representing a mutable view of the original Map at the given prefix
   */
  atPrefix(prefix: string): SearchableMap<Value> {
    if (!prefix.startsWith(this._prefix)) throw new Error("Mismatched prefix");

    const [node, path] = trackDown(this._tree, prefix.slice(this._prefix.length));

    if (node === undefined) {
      const [parentNode, key] = last(path);

      for (const childKey of parentNode.keys())
        if (childKey !== LEAF && childKey.startsWith(key)) {
          const node = new Map([
            // oxlint-disable-next-line typescript/no-non-null-assertion
            [childKey.slice(key.length), parentNode.get(childKey)!],
          ]) as RadixTree<Value>;

          return new SearchableMap<Value>(node, prefix);
        }
    }

    return new SearchableMap<Value>(node, prefix);
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/clear
   */
  clear(): void {
    this._size = undefined;
    this._tree.clear();
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/delete
   * @param key  Key to delete
   */
  delete(key: string): void {
    this._size = undefined;

    remove(this._tree, key);
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries
   * @returns An iterator iterating through `[key, value]` entries.
   */
  entries(): TreeIterator<Value, "ENTRIES"> {
    return new TreeIterator(this, ENTRIES);
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/forEach
   * @param fn Iteration function
   */
  forEach(fn: (key: string, value: Value, map: SearchableMap) => void): void {
    for (const [key, value] of this) fn(key, value, this);
  }

  /**
   * Returns a Map of all the entries that have a key within the given edit
   * distance from the search key. The keys of the returned Map are the matching
   * keys, while the values are two-element arrays where the first element is
   * the value associated to the key, and the second is the edit distance of the
   * key to the search key.
   *
   * ### Usage:
   *
   * ```js
   * const map = new SearchableMap()
   * map.set('hello', 'world')
   * map.set('hell', 'yeah')
   * map.set('ciao', 'mondo')
   *
   * // Get all entries that match the key 'hallo' with a maximum edit distance of 2
   * map.fuzzyGet('hallo', 2)
   * // => Map(2) { 'hello' => ['world', 1], 'hell' => ['yeah', 2] }
   *
   * // In the example, the "hello" key has value "world" and edit distance of 1
   * // (change "e" to "a"), the key "hell" has value "yeah" and edit distance of 2
   * // (change "e" to "a", delete "o")
   * ```
   *
   * @param key  The search key
   * @param maxEditDistance  The maximum edit distance (Levenshtein)
   * @returns A Map of the matching keys to their value and edit distance
   */
  fuzzyGet(key: string, maxEditDistance: number): FuzzyResults<Value> {
    return fuzzySearch<Value>(this._tree, key, maxEditDistance);
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/get
   * @param key Key to get
   * @returns Value associated to the key, or `undefined` if the key is not
   * found.
   */
  get(key: string): Value | undefined {
    const node = lookup<Value>(this._tree, key);

    // oxlint-disable-next-line no-undefined
    return node === undefined ? undefined : node.get(LEAF);
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/has
   * @param key Key
   * @returns True if the key is in the map, false otherwise
   */
  has(key: string): boolean {
    const node = lookup(this._tree, key);

    return node?.has(LEAF) ?? false;
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys
   * @returns An `Iterable` iterating through keys
   */
  keys(): TreeIterator<Value, "KEYS"> {
    return new TreeIterator(this, KEYS);
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/set
   * @param key  Key to set
   * @param value  Value to associate to the key
   * @returns The {@link SearchableMap} itself, to allow chaining
   */
  set(key: string, value: Value): this {
    if (typeof key !== "string") throw new Error("key must be a string");

    this._size = undefined;
    const node = createPath(this._tree, key);

    node.set(LEAF, value);

    return this;
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/size
   */
  get size(): number {
    if (typeof this._size === "number") return this._size;

    /** @ignore */
    this._size = 0;

    const iter = this.entries();

    while (!iter.next().done) this._size += 1;

    return this._size;
  }

  /**
   * Updates the value at the given key using the provided function. The function
   * is called with the current value at the key, and its return value is used as
   * the new value to be set.
   *
   * ### Example:
   *
   * ```js
   * // Increment the current value by one
   * searchableMap.update('somekey', (currentValue) => currentValue == null ? 0 : currentValue + 1)
   * ```
   *
   * If the value at the given key is or will be an object, it might not require
   * re-assignment. In that case it is better to use `fetch()`, because it is
   * faster.
   *
   * @param key  The key to update
   * @param fn  The function used to compute the new value from the current one
   * @returns The {@link SearchableMap} itself, to allow chaining
   */
  update(key: string, fn: (value: Value | undefined) => Value): this {
    if (typeof key !== "string") throw new Error("key must be a string");

    this._size = undefined;
    const node = createPath(this._tree, key);

    node.set(LEAF, fn(node.get(LEAF)));

    return this;
  }

  /**
   * Fetches the value of the given key. If the value does not exist, calls the
   * given function to create a new value, which is inserted at the given key
   * and subsequently returned.
   *
   * ### Example:
   *
   * ```js
   * const map = searchableMap.fetch('somekey', () => new Map())
   * map.set('foo', 'bar')
   * ```
   *
   * @param key  The key to update
   * @param initial  A function that creates a new value if the key does not exist
   * @returns The existing or new value at the given key
   */
  fetch(key: string, initial: () => Value): Value {
    if (typeof key !== "string") throw new Error("key must be a string");

    this._size = undefined;
    const node = createPath(this._tree, key);

    let value = node.get(LEAF);

    if (value === undefined) node.set(LEAF, (value = initial()));

    return value;
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values
   * @returns An `Iterable` iterating through values.
   */
  values(): TreeIterator<Value, "VALUES"> {
    return new TreeIterator(this, VALUES);
  }

  /**
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/Symbol.iterator
   *
   * @returns An iterator iterating through `[key, value]` entries.
   */
  [Symbol.iterator](): TreeIterator<Value, "ENTRIES"> {
    return this.entries();
  }

  /**
   * Creates a {@link SearchableMap} from an `Iterable` of entries
   *
   * @param entries Entries to be inserted in the {@link SearchableMap}
   * @returns A new {@link SearchableMap} with the given entries
   */
  static from<T = any>(entries: Iterable<Entry<T>> | Entry<T>[]): SearchableMap<T> {
    const tree = new SearchableMap<T>();

    for (const [key, value] of entries) tree.set(key, value);

    return tree;
  }

  /**
   * Creates a {@link SearchableMap} from the iterable properties of a JavaScript object
   *
   * @param object Object of entries for the {@link SearchableMap}
   * @returns A new {@link SearchableMap} with the given entries
   */
  static fromObject<T = any>(object: Record<string, T>): SearchableMap<T> {
    return SearchableMap.from<T>(Object.entries(object));
  }
}

const trackDown = <T = any>(
  tree: RadixTree<T> | undefined,
  key: string,
  path: Path<T> = [],
): [RadixTree<T> | undefined, Path<T>] => {
  if (key.length === 0 || tree == null) return [tree, path];

  for (const treeKey of tree.keys())
    if (treeKey !== LEAF && key.startsWith(treeKey)) {
      path.push([tree, treeKey]); // performance: update in place

      return trackDown(tree.get(treeKey), key.slice(treeKey.length), path);
    }

  path.push([tree, key]); // performance: update in place

  // oxlint-disable-next-line no-undefined
  return trackDown(undefined, "", path);
};

const lookup = <T = any>(tree: RadixTree<T>, key: string): RadixTree<T> | undefined => {
  // oxlint-disable-next-line typescript/strict-boolean-expressions
  if (key.length === 0 || !tree) return tree;

  for (const treeKey of tree.keys())
    if (treeKey !== LEAF && key.startsWith(treeKey))
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return lookup(tree.get(treeKey)!, key.slice(treeKey.length));
};

// Create a path in the radix tree for the given key, and returns the deepest
// node. This function is in the hot path for indexing. It avoids unnecessary
// string operations and recursion for performance.
const createPath = <T = any>(node: RadixTree<T>, key: string): RadixTree<T> => {
  const keyLength = key.length;

  // oxlint-disable-next-line no-labels, typescript/strict-boolean-expressions
  outer: for (let pos = 0; node && pos < keyLength; ) {
    // Check whether this key is a candidate: the first characters must match.
    for (const childKey of node.keys())
      if (childKey !== LEAF && key[pos] === childKey[0]) {
        const len = Math.min(keyLength - pos, childKey.length);

        // Advance offset to the point where key and k no longer match.
        let offset = 1;

        while (offset < len && key[pos + offset] === childKey[offset]) ++offset;

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const child = node.get(childKey)!;

        if (offset === childKey.length) {
          // The existing key is shorter than the key we need to create.
          // oxlint-disable-next-line no-param-reassign
          node = child;
        } else {
          // Partial match: we need to insert an intermediate node to contain
          // both the existing subtree and the new node.
          const intermediate = new Map([[childKey.slice(offset), child]]) as RadixTree<T>;

          node.set(key.slice(pos, pos + offset), intermediate);
          node.delete(childKey);
          // oxlint-disable-next-line no-param-reassign
          node = intermediate;
        }

        pos += offset;
        // oxlint-disable-next-line no-labels
        continue outer;
      }

    // Create a final child node to contain the final suffix of the key.
    const child = new Map();

    node.set(key.slice(pos), child);

    return child;
  }

  return node;
};

const remove = <T = any>(tree: RadixTree<T>, key: string): void => {
  const [node, path] = trackDown(tree, key);

  if (node === undefined) return;

  node.delete(LEAF);

  if (node.size === 0) {
    cleanup(path);
  } else if (node.size === 1) {
    const [key, value] = (
      node.entries().next() as IteratorResult<[string, RadixTree<T>], [string, RadixTree<T>]>
    ).value;

    merge(path, key, value);
  }
};

const cleanup = <T = any>(path: Path<T>): void => {
  if (path.length === 0) return;

  const [node, key] = last(path);

  node.delete(key);

  if (node.size === 0) {
    cleanup(path.slice(0, -1));
  } else if (node.size === 1) {
    const [key, value] = (
      node.entries().next() as IteratorResult<[string, RadixTree<T>], [string, RadixTree<T>]>
    ).value;

    if (key !== LEAF) merge(path.slice(0, -1), key, value);
  }
};

const merge = <T = any>(path: Path<T>, key: string, value: RadixTree<T>): void => {
  if (path.length === 0) return;

  const [node, nodeKey] = last(path);

  node.set(nodeKey + key, value);
  node.delete(nodeKey);
};

const last = <T = any>(array: T[]): T => array[array.length - 1];
