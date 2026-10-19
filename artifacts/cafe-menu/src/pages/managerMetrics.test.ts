import { test } from "node:test";
import assert from "node:assert/strict";
import { managerMetrics, type DashboardOrder } from "./managerMetrics";
const order: DashboardOrder = {
  id: "one",
  branchId: null,
  createdAt: "2026-10-19T21:00:00Z",
  status: "paid",
  payment: "mixed",
  service: "dinein",
  totalMinor: 900,
  cardPaidMinor: 400,
  discountMinor: 100,
  items: [{ id: "coffee", name_ar: "قهوة", qty: 2, price_minor: 500 }],
};
test("dashboard uses applied payments, Riyadh hour and original product prices", () => {
  const m = managerMetrics([order]);
  assert.equal(m.sales, 900);
  assert.equal(m.cash, 500);
  assert.equal(m.card, 400);
  assert.equal(m.hours[0].sales, 9);
  assert.equal(m.products[0].gross, 10);
  assert.equal(m.discount, 100);
  assert.equal(m.branches[0].sales, 9);
  assert.equal(m.services.dinein, 1);
});
test("voids are counted separately and excluded from all sales charts", () => {
  const m = managerMetrics([
    order,
    { ...order, status: "voided", totalMinor: 5000 },
  ]);
  assert.equal(m.voided, 1);
  assert.equal(m.voidValue, 5000);
  assert.equal(m.sales, 900);
  assert.equal(m.products[0].qty, 2);
  assert.equal(m.average, 900);
  assert.equal(m.hours[0].orders, 1);
});
test("empty data and card-only legacy sales remain accurate", () => {
  assert.equal(managerMetrics([]).average, 0);
  const m = managerMetrics([
    { ...order, payment: "card", cardPaidMinor: null },
  ]);
  assert.equal(m.cash, 0);
  assert.equal(m.card, 900);
});
