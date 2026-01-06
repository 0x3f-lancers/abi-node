/**
 * In-memory state store for contract state.
 *
 * Uses convention-based mapping between setters and getters:
 * - setFoo(key, value) stores under normalized key "foo:key"
 * - getFoo(key) or foo(key) reads from "foo:key"
 */
export class StateStore {
  private state: Map<string, unknown[]> = new Map();

  /**
   * Normalize function name to base form:
   * - setBalance → balance
   * - getBalance → balance
   * - set → _default (bare set/get pair)
   * - get → _default
   * - balance → balance
   */
  private normalizeFnName(fn: string): string {
    // Handle bare "set" and "get" functions
    if (fn === "set" || fn === "get") {
      return "_default";
    }
    if (fn.startsWith("set") && fn.length > 3) {
      return fn.charAt(3).toLowerCase() + fn.slice(4);
    }
    if (fn.startsWith("get") && fn.length > 3) {
      return fn.charAt(3).toLowerCase() + fn.slice(4);
    }
    return fn;
  }

  private makeKey(
    contract: string,
    fn: string,
    keyArgs: readonly unknown[]
  ): string {
    const normalizedFn = this.normalizeFnName(fn);
    return `${contract.toLowerCase()}:${normalizedFn}:${JSON.stringify(keyArgs)}`;
  }

  /**
   * Store state from a setter call.
   * For setFoo(a, b, c): keyArgs=[a,b], values=[c]
   */
  set(
    contract: string,
    fn: string,
    keyArgs: readonly unknown[],
    values: unknown[]
  ): void {
    const key = this.makeKey(contract, fn, keyArgs);
    this.state.set(key, values);
  }

  /**
   * Read state for a getter call.
   * For getFoo(a, b): looks up with keyArgs=[a,b]
   */
  get(
    contract: string,
    fn: string,
    keyArgs: readonly unknown[]
  ): unknown[] | undefined {
    const key = this.makeKey(contract, fn, keyArgs);
    return this.state.get(key);
  }

  clear(): void {
    this.state.clear();
  }
}
