import { test } from "node:test";
import assert from "node:assert/strict";
import { purchaseAmounts, purchaseInput } from "./purchases";
const line = {
  itemId: "00000000-0000-4000-8000-000000000001",
  quantity: "1.005",
  unitCostMinor: 125,
};
test("purchase lines round fractional unit costs to halalas and sum actual receipt amounts", () => {
  const r = purchaseAmounts([
    line,
    {
      ...line,
      itemId: "00000000-0000-4000-8000-000000000002",
      quantity: "2",
      unitCostMinor: 500,
    },
  ]);
  assert.equal(r.lines[0].quantityMilli, 1005);
  assert.equal(r.lines[0].lineTotalMinor, 126);
  assert.equal(r.totalMinor, 1126);
});
test("purchase bounds, zero quantity, repeated materials and aggregate overflow fail", () => {
  assert.throws(() => purchaseAmounts([line, line]));
  assert.throws(() => purchaseAmounts([{ ...line, quantity: "0" }]));
  assert.throws(() =>
    purchaseAmounts([
      { ...line, quantity: "1000000", unitCostMinor: 100000000 },
    ]),
  );
  assert.throws(() => purchaseAmounts([{ ...line, unitCostMinor: -1 }]));
  assert.throws(() => purchaseAmounts([{ ...line, unitCostMinor: 1.5 }]));
});
test("supplier document dates and required references validate before posting", () => {
  const data = {
    id: line.itemId,
    supplierId: line.itemId,
    branchId: null,
    reference: " inv-1 ",
    documentDate: "2026-10-23",
    items: [{ ...line, expectedUnit: "kg" }],
  };
  assert.equal(purchaseInput.parse(data).reference, "INV-1");
  assert.equal(
    purchaseInput.safeParse({ ...data, documentDate: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    purchaseInput.safeParse({ ...data, reference: " " }).success,
    false,
  );
  assert.equal(purchaseInput.safeParse({ ...data, items: [] }).success, false);
});
