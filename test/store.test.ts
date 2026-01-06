import { describe, it, expect, beforeEach } from "vitest";
import { StateStore } from "../src/state/store";

describe("3. State Store Normalization", () => {
  let store: StateStore;
  const MOCK_CONTRACT = "0x1234567890123456789012345678901234567890";
  const MOCK_KEY = ["user1"];
  const MOCK_VALUE = [100n];

  beforeEach(() => {
    store = new StateStore();
  });

  it("should treat setFoo and getFoo as the same key", () => {
    store.set(MOCK_CONTRACT, "setScore", MOCK_KEY, MOCK_VALUE);
    const result = store.get(MOCK_CONTRACT, "getScore", MOCK_KEY);
    expect(result).toEqual(MOCK_VALUE);
  });

  it("should treat setFoo and foo as the same key", () => {
    store.set(MOCK_CONTRACT, "setScore", MOCK_KEY, MOCK_VALUE);
    const result = store.get(MOCK_CONTRACT, "score", MOCK_KEY);
    expect(result).toEqual(MOCK_VALUE);
  });

  it("should treat bare set and get as the same key", () => {
    store.set(MOCK_CONTRACT, "set", MOCK_KEY, MOCK_VALUE);
    const result = store.get(MOCK_CONTRACT, "get", MOCK_KEY);
    expect(result).toEqual(MOCK_VALUE);
  });

  it("should handle multi-key setters and getters", () => {
    const multiKey = ["user1", "game1"];
    store.set(MOCK_CONTRACT, "setPlayerScore", multiKey, MOCK_VALUE);
    const result = store.get(MOCK_CONTRACT, "getPlayerScore", multiKey);
    expect(result).toEqual(MOCK_VALUE);
  });

  it("should isolate state between different contracts", () => {
    const OTHER_CONTRACT = "0x0987654321098765432109876543210987654321";
    store.set(MOCK_CONTRACT, "setValue", [], [1n]);
    store.set(OTHER_CONTRACT, "setValue", [], [2n]);

    const result1 = store.get(MOCK_CONTRACT, "getValue", []);
    const result2 = store.get(OTHER_CONTRACT, "getValue", []);

    expect(result1).toEqual([1n]);
    expect(result2).toEqual([2n]);
  });

  it("should return undefined for a non-existent key", () => {
    const result = store.get(MOCK_CONTRACT, "getNonExistent", []);
    expect(result).toBeUndefined();
  });
});
