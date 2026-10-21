import { test } from "node:test";
import assert from "node:assert/strict";
import { quantityMilli, stockChange, transferChange } from "./stock";
test("fractional quantities are exact milli-units", () => {
  assert.equal(quantityMilli("1.005"), 1005);
  assert.equal(quantityMilli("0.001"), 1);
  assert.equal(quantityMilli("1000000"), 1000000000);
  for (const s of ["-1", "1.0001", "1e3", "1000000.001", ""])
    assert.throws(() => quantityMilli(s));
});
test("receipt, issue and waste preserve the stock identity", () => {
  let r = stockChange(0, "receipt", 1234);
  assert.deepEqual(r, { beforeMilli: 0, afterMilli: 1234, deltaMilli: 1234 });
  r = stockChange(r.afterMilli, "issue", 234);
  assert.equal(r.afterMilli, 1000);
  r = stockChange(r.afterMilli, "waste", 100);
  assert.equal(r.afterMilli, 900);
  assert.equal(r.afterMilli - r.beforeMilli, r.deltaMilli);
});
test("physical counts set a target instead of adding it and allow empty or unchanged stock", () => {
  assert.deepEqual(stockChange(10000, "count", 7500), {
    beforeMilli: 10000,
    afterMilli: 7500,
    deltaMilli: -2500,
  });
  assert.equal(stockChange(1000, "count", 1000).deltaMilli, 0);
  assert.equal(stockChange(1000, "count", 0).afterMilli, 0);
});
test("insufficient stock, overflow and invalid movements are rejected", () => {
  assert.throws(() => stockChange(100, "issue", 101));
  assert.throws(() => stockChange(100, "waste", 101));
  assert.throws(() => stockChange(1000000000, "receipt", 1));
  for (const [kind, input] of [
    ["receipt", 0],
    ["issue", 0],
    ["unknown", 1],
    ["count", 1.5],
  ] as [string, number][])
    assert.throws(() => stockChange(0, kind, input));
});

test("transfers conserve total quantity, including fractional units", () => {
  const r = transferChange(10005, 2000, 5005, "branch-a", "branch-b");
  assert.equal(r.source.afterMilli, 5000);
  assert.equal(r.destination.afterMilli, 7005);
  assert.equal(r.source.deltaMilli + r.destination.deltaMilli, 0);
  assert.equal(r.source.afterMilli + r.destination.afterMilli, 12005);
});
test("transfers reject identical locations, shortages and destination overflow", () => {
  assert.throws(() => transferChange(1000, 0, 100, "none", "none"));
  assert.throws(() => transferChange(100, 0, 101, "a", "b"));
  assert.throws(() => transferChange(100, 1000000000, 1, "a", "b"));
  assert.throws(() => transferChange(100, 0, 0, "a", "b"));
});
