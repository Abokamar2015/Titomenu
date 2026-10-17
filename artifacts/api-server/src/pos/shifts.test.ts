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
