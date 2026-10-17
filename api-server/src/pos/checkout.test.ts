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
