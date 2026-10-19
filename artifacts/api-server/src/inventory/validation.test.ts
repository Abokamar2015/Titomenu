import { test } from "node:test";
import assert from "node:assert/strict";
import {
  supplierInput,
  itemInput,
  listInput,
  literalSearch,
} from "./validation";
const supplier = { code: "  sup-01 ", nameAr: "مورد القهوة" };
const item = {
  code: "milk_1",
  nameAr: "حليب",
  unit: "ml",
  minimumQuantity: "2.500",
  referenceCostMinor: 1250,
};
test("supplier codes normalize consistently and optional fields receive safe defaults", () => {
  const r = supplierInput.parse(supplier);
  assert.equal(r.code, "SUP-01");
  assert.equal(r.isActive, true);
  assert.equal(r.email, "");
  assert.equal(r.notes, "");
  assert.equal(
    supplierInput.safeParse({ ...supplier, email: "wrong" }).success,
    false,
  );
});
test("material precision is fixed without changing unit cost", () => {
  const r = itemInput.parse(item);
  assert.equal(r.minimumQuantity, "2.500");
  assert.equal(r.referenceCostMinor, 1250);
  assert.equal(r.supplierId, null);
  assert.equal(
    itemInput.parse({ ...item, minimumQuantity: "0" }).minimumQuantity,
    "0.000",
  );
});
test("invalid amounts, units, quantities and codes cannot enter the catalog", () => {
  for (const minimumQuantity of [
    "-1",
    "1.2345",
    "1000000.001",
    "1e3",
    "",
    "NaN",
  ])
    assert.equal(
      itemInput.safeParse({ ...item, minimumQuantity }).success,
      false,
    );
  for (const referenceCostMinor of [-1, 1.5, 100000001])
    assert.equal(
      itemInput.safeParse({ ...item, referenceCostMinor }).success,
      false,
    );
  assert.equal(
    itemInput.safeParse({ ...item, unit: "unknown" }).success,
    false,
  );
  for (const code of ["", "supplier space", "عربي", "=SUM(A1)"])
    assert.equal(supplierInput.safeParse({ ...supplier, code }).success, false);
  assert.equal(
    supplierInput.safeParse({ ...supplier, nameAr: "  " }).success,
    false,
  );
});
test("search treats SQL pattern characters literally and rejects invalid pagination", () => {
  assert.equal(literalSearch("a_%\\"), "%a\\_\\%\\\\%");
  assert.equal(listInput.parse({ offset: "50" }).offset, 50);
  assert.equal(listInput.safeParse({ offset: -1 }).success, false);
  assert.equal(listInput.safeParse({ status: "deleted" }).success, false);
});
