import { describe, it, expect } from "vitest";
import { parseAbi } from "viem";
import { findMatchingEvents, generateEventLog } from "../src/abi/events";

const mockAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 amount)",
  "event ValueSet(uint256 newValue)",
  "event ScoreUpdated(address player, uint256 newScore)",
  "event PlayerChanged(address newPlayer)",
  "event Approval(address owner, address spender, uint256 amount)",
]);

describe("Phase 4: Events & Logs", () => {
  describe("1. Event Matching (findMatchingEvents)", () => {
    it("should match event name directly (transfer -> Transfer)", () => {
      const matches = findMatchingEvents(mockAbi, "transfer");
      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe("Transfer");
    });

    it("should match case-insensitively", () => {
      const matches = findMatchingEvents(mockAbi, "TRANSFER");
      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe("Transfer");
    });

    it("should match suffix (set -> ValueSet)", () => {
      const matches = findMatchingEvents(mockAbi, "set");
      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe("ValueSet");
    });

    it("should match setFoo -> FooSet/FooUpdated/FooChanged", () => {
      const matches = findMatchingEvents(mockAbi, "setScore");
      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe("ScoreUpdated");

      const matches2 = findMatchingEvents(mockAbi, "setPlayer");
      expect(matches2.length).toBe(1);
      expect(matches2[0].name).toBe("PlayerChanged");
    });

    it("should not match unrelated events", () => {
      const matches = findMatchingEvents(mockAbi, "transfer");
      const names = matches.map((m) => m.name);
      expect(names).not.toContain("Approval");
    });
  });

  describe("2. Event Parameter Mapping & Encoding (generateEventLog)", () => {
    // event Transfer(address indexed from, address indexed to, uint256 amount)
    const transferEvent = mockAbi.find((e) => e.name === "Transfer");
    const SENDER = "0x0000000000000000000000000000000000000001";
    const RECIPIENT = "0x0000000000000000000000000000000000000002";

    it("should map `from`/`sender` to the transaction sender", () => {
      const { topics } = generateEventLog(transferEvent!, SENDER, SENDER, []);
      // topic1 should be the sender
      expect(topics[1]).toBe(`0x${SENDER.slice(2).padStart(64, "0")}`);
    });

    it("should map parameters by name", () => {
      const { topics, data } = generateEventLog(
        transferEvent!,
        SENDER,
        SENDER,
        [RECIPIENT, 50n], // args from function call
        ["to", "amount"] // names of function inputs
      );
      // topic2 should be the recipient
      expect(topics[2]).toBe(`0x${RECIPIENT.slice(2).padStart(64, "0")}`);
      // data should be the amount
      expect(data).toBe(`0x${50n.toString(16).padStart(64, "0")}`);
    });

    it("should support aliases like `recipient` for `to`", () => {
      const { topics } = generateEventLog(
        transferEvent!,
        SENDER,
        SENDER,
        [RECIPIENT],
        ["recipient"]
      );
      // topic2 should still be the recipient
      expect(topics[2]).toBe(`0x${RECIPIENT.slice(2).padStart(64, "0")}`);
    });

    it("should use a default value for unmatched parameters", () => {
      // We don't provide an `amount`, so it should get the default `1n`
      const { data } = generateEventLog(
        transferEvent!,
        SENDER,
        SENDER,
        [RECIPIENT],
        ["to"]
      );
      expect(data).toBe(`0x${1n.toString(16).padStart(64, "0")}`);
    });

    it("should correctly encode topic0 from the event signature", () => {
      const { topics } = generateEventLog(transferEvent!, SENDER, SENDER, []);
      // keccak256("Transfer(address,address,uint256)")
      expect(topics[0]).toBe(
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
      );
    });
  });
});
