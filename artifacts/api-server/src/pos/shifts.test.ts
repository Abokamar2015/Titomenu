import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeShift, reconcileShift, type ShiftOrder } from "./shifts";
const base: ShiftOrder = {
  status: "paid",
  payment: "cash",
  totalMinor: 4000,
  cardPaidMinor: 0,
  discountMinor: 500,
};
test("drawer balance uses applied cash, excluding change and card parts", () => {
  const result = summarizeShift(10000, [
    base,
    { ...base, payment: "card", cardPaidMinor: 4000 },
    { ...base, payment: "mixed", cardPaidMinor: 2500 },
  ]);
  assert.equal(result.salesMinor, 12000);
  assert.equal(result.cashMinor, 5500);
  assert.equal(result.cardMinor, 6500);
  assert.equal(result.expectedMinor, 15500);
  assert.equal(result.cashMinor + result.cardMinor, result.salesMinor);
  assert.equal(result.discountMinor, 1500);
  assert.equal(result.paidCount, 3);
});
test("voided sales do not affect drawer balance, net sales or discounts", () => {
  const s = summarizeShift(5000, [base, { ...base, status: "voided" }]);
  assert.equal(s.salesMinor, 4000);
  assert.equal(s.cashMinor, 4000);
  assert.equal(s.expectedMinor, 9000);
  assert.equal(s.discountMinor, 500);
  assert.equal(s.voidedCount, 1);
});
test("empty shift expects opening float only", () => {
  const s = summarizeShift(5000, []);
  assert.equal(s.expectedMinor, 5000);
  assert.equal(s.paidCount, 0);
  assert.equal(s.salesMinor, 0);
});
test("legacy full-card orders remain card-only", () => {
  const s = summarizeShift(0, [
    { ...base, payment: "card", cardPaidMinor: null },
  ]);
  assert.equal(s.cardMinor, 4000);
  assert.equal(s.cashMinor, 0);
});
test("reconciliation records signed differences and requires an explanation", () => {
  assert.equal(reconcileShift(10000, 10000, "").varianceMinor, 0);
  assert.equal(reconcileShift(10000, 9500, "short 5").varianceMinor, -500);
  assert.equal(reconcileShift(10000, 10500, "extra 5").varianceMinor, 500);
  assert.throws(() => reconcileShift(10000, 9500, ""));
  assert.throws(() => reconcileShift(10000, -1, "bad"));
  assert.throws(() => reconcileShift(10000, 1.5, "bad"));
});
test("invalid payments and overflowing drawer balances cannot be reconciled", () => {
  assert.throws(() => summarizeShift(-1, []));
  assert.throws(() =>
    summarizeShift(0, [{ ...base, payment: "mixed", cardPaidMinor: 5000 }]),
  );
  assert.throws(() => summarizeShift(2000000000, [base]));
});

test("cash movements change drawer balance without changing sales", () => {
  const s = summarizeShift(
    10000,
    [base],
    [
      { id: "a", kind: "in", amountMinor: 3000 },
      { id: "b", kind: "out", amountMinor: 2000 },
      { id: "c", kind: "expense", amountMinor: 500 },
    ],
  );
  assert.equal(s.expectedMinor, 14500);
  assert.equal(s.salesMinor, 4000);
  assert.equal(s.cashInMinor, 3000);
  assert.equal(s.cashOutMinor, 2500);
  assert.equal(s.expenseMinor, 500);
  assert.equal(s.movementCount, 3);
});
test("expense reversal restores cash and removes net expense", () => {
  const s = summarizeShift(
    1000,
    [],
    [
      { id: "a", kind: "expense", amountMinor: 500 },
      { id: "b", kind: "in", amountMinor: 500, reversesId: "a" },
    ],
  );
  assert.equal(s.expectedMinor, 1000);
  assert.equal(s.expenseMinor, 0);
  assert.equal(s.cashInMinor, 500);
  assert.equal(s.cashOutMinor, 500);
});
test("deposit reversal removes the deposited cash", () => {
  const s = summarizeShift(
    1000,
    [],
    [
      { id: "a", kind: "in", amountMinor: 500 },
      { id: "b", kind: "out", amountMinor: 500, reversesId: "a" },
    ],
  );
  assert.equal(s.expectedMinor, 1000);
});
test("withdrawals and refunds cannot exceed available cash", () => {
  assert.throws(() =>
    summarizeShift(100, [], [{ id: "a", kind: "out", amountMinor: 101 }]),
  );
  assert.throws(() =>
    summarizeShift(
      0,
      [{ ...base, status: "voided" }],
      [{ id: "a", kind: "expense", amountMinor: 500 }],
    ),
  );
});
test("cash movements reject invalid amounts and kinds", () => {
  for (const amountMinor of [0, -1, 1.5, 100000001])
    assert.throws(() =>
      summarizeShift(1000, [], [{ id: "a", kind: "in", amountMinor }]),
    );
  assert.throws(() =>
    summarizeShift(1000, [], [{ id: "a", kind: "card", amountMinor: 1 }]),
  );
});
test("card receipts do not fund cash withdrawals", () => {
  assert.throws(() =>
    summarizeShift(
      0,
      [{ ...base, payment: "card" }],
      [{ id: "a", kind: "out", amountMinor: 1 }],
    ),
  );
});
