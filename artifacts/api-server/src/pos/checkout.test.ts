import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateOrder } from "./checkout";
const p = [
  { id: "a", nameAr: "قهوة", nameEn: "Coffee", price: 18, isAvailable: true },
];
test("uses menu SAR prices and ignores client amounts", () =>
  assert.equal(calculateOrder([{ id: "a", qty: 2 }], p).total, 3600));
test("combines duplicate items and preserves receipt snapshot", () => {
  const o = calculateOrder(
    [
      { id: "a", qty: 2 },
      { id: "a", qty: 1 },
    ],
    p,
  );
  assert.equal(o.total, 5400);
  assert.equal(o.lines.length, 1);
  assert.equal(o.lines[0].name_ar, "قهوة");
  p[0].price = 22;
  assert.equal(o.lines[0].price_minor, 1800);
  p[0].price = 18;
});
test("rejects unavailable and unknown products", () => {
  assert.throws(() => calculateOrder([{ id: "b", qty: 1 }], p));
  assert.throws(() =>
    calculateOrder([{ id: "a", qty: 1 }], [{ ...p[0], isAvailable: false }]),
  );
});
test("rejects invalid quantities, empty and excessive orders", () => {
  for (const qty of [0, -1, 1.5, 1000])
    assert.throws(() => calculateOrder([{ id: "a", qty }], p));
  assert.throws(() => calculateOrder([], p));
  assert.throws(() =>
    calculateOrder(
      [
        { id: "a", qty: 999 },
        { id: "a", qty: 1 },
      ],
      p,
    ),
  );
});

import { calculateSettlement } from "./checkout";
const settlementInput = {
  discountMinor: 500,
  discountReason: "عرض مدير",
  payment: "cash" as const,
  cashReceivedMinor: 5000,
};
test("discount and cash change use integer minor units", () => {
  const s = calculateSettlement(4500, settlementInput, true);
  assert.equal(s.totalMinor, 4000);
  assert.equal(s.cashReceivedMinor! - s.totalMinor, 1000);
});
test("staff cannot bypass discount permissions", () =>
  assert.throws(() => calculateSettlement(4500, settlementInput, false)));
test("reject over-discount, fractional discount, missing reason and insufficient cash", () => {
  assert.throws(() =>
    calculateSettlement(
      4500,
      { ...settlementInput, discountMinor: 4501 },
      true,
    ),
  );
  assert.throws(() =>
    calculateSettlement(4500, { ...settlementInput, discountMinor: 0.5 }, true),
  );
  assert.throws(() =>
    calculateSettlement(4500, { ...settlementInput, discountReason: "" }, true),
  );
  assert.throws(() =>
    calculateSettlement(
      4500,
      { ...settlementInput, cashReceivedMinor: 3999 },
      true,
    ),
  );
});
test("card transactions never store cash received; old clients default to exact cash", () => {
  assert.equal(
    calculateSettlement(4500, { ...settlementInput, payment: "card" }, true)
      .cashReceivedMinor,
    null,
  );
  assert.equal(
    calculateSettlement(
      4500,
      { ...settlementInput, discountMinor: 0, cashReceivedMinor: null },
      false,
    ).cashReceivedMinor,
    4500,
  );
});
test("full manager discount may produce a zero total", () =>
  assert.equal(
    calculateSettlement(
      4500,
      { ...settlementInput, discountMinor: 4500, cashReceivedMinor: 0 },
      true,
    ).totalMinor,
    0,
  ));

test("split payment preserves net sales and computes change from the cash portion", () => {
  const s = calculateSettlement(
    4500,
    {
      ...settlementInput,
      payment: "mixed",
      cardPaidMinor: 2500,
      cashReceivedMinor: 2000,
    },
    true,
  );
  assert.equal(s.totalMinor, 4000);
  assert.equal(s.cardPaidMinor, 2500);
  const cashApplied = s.totalMinor - s.cardPaidMinor;
  assert.equal(cashApplied, 1500);
  assert.equal(s.cashReceivedMinor! - cashApplied, 500);
  assert.equal(cashApplied + s.cardPaidMinor, s.totalMinor);
});
test("split payment rejects empty, zero, full, excessive, negative and fractional card parts", () => {
  for (const cardPaidMinor of [null, 0, 4000, 4001, -1, 0.5])
    assert.throws(() =>
      calculateSettlement(
        4500,
        { ...settlementInput, payment: "mixed", cardPaidMinor },
        true,
      ),
    );
});
test("split payment rejects insufficient cash and defaults blank received to exact cash due", () => {
  assert.throws(() =>
    calculateSettlement(
      4500,
      {
        ...settlementInput,
        payment: "mixed",
        cardPaidMinor: 2500,
        cashReceivedMinor: 1499,
      },
      true,
    ),
  );
  assert.equal(
    calculateSettlement(
      4500,
      {
        ...settlementInput,
        payment: "mixed",
        cardPaidMinor: 2500,
        cashReceivedMinor: null,
      },
      true,
    ).cashReceivedMinor,
    1500,
  );
});
test("full cash and full card allocate the whole total to only one method", () => {
  const cash = calculateSettlement(
    4500,
    { ...settlementInput, payment: "cash", cardPaidMinor: 1200 },
    true,
  );
  const card = calculateSettlement(
    4500,
    { ...settlementInput, payment: "card", cardPaidMinor: 1200 },
    true,
  );
  assert.equal(cash.cardPaidMinor, 0);
  assert.equal(card.cardPaidMinor, 4000);
  assert.equal(card.cashReceivedMinor, null);
});
