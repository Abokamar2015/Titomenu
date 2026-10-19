import { test } from "node:test";
import assert from "node:assert/strict";
import { dailySales } from "./dailySales";
const sale = {
  createdAt: "2026-10-19T21:01:00Z",
  status: "paid",
  payment: "cash",
  totalMinor: 1000,
  cardPaidMinor: null,
  discountMinor: 100,
};
test("daily summary respects Riyadh midnight, split payment and voids", () => {
  const rows = dailySales([
    sale,
    { ...sale, payment: "mixed", cardPaidMinor: 400 },
    { ...sale, status: "voided" },
    { ...sale, createdAt: "2026-10-19T20:59:00Z", payment: "card" },
  ]);
  assert.deepEqual(rows[0], {
    date: "2026-10-20",
    count: 2,
    voided: 1,
    total: 2000,
    cash: 1600,
    card: 400,
    discount: 200,
  });
  assert.equal(rows[1].date, "2026-10-19");
  assert.equal(rows[1].cash, 0);
  assert.equal(rows[1].card, 1000);
});
test("empty periods and void-only days preserve counts without sales", () => {
  assert.deepEqual(dailySales([]), []);
  const [r] = dailySales([{ ...sale, status: "voided" }]);
  assert.equal(r.voided, 1);
  assert.equal(r.total, 0);
  assert.equal(r.discount, 0);
});
