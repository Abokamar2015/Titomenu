import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageProducts, canVoidOrder } from "./permissions";
test("cashiers cannot manage products; owners and managers can", () => {
  assert.equal(canManageProducts("staff"), false);
  assert.equal(canManageProducts(null), false);
  assert.equal(canManageProducts("owner"), true);
  assert.equal(canManageProducts("manager"), true);
  assert.equal(canManageProducts(null, true), true);
});
test("cashiers can cancel only their own orders in the selected restaurant", () => {
  const cashier = { restaurantId: "r1", userId: "u1", manager: false };
  assert.equal(
    canVoidOrder(cashier, { restaurantId: "r1", createdBy: "u1" }),
    true,
  );
  assert.equal(
    canVoidOrder(cashier, { restaurantId: "r1", createdBy: "u2" }),
    false,
  );
  assert.equal(
    canVoidOrder(cashier, { restaurantId: "r2", createdBy: "u1" }),
    false,
  );
  assert.equal(
    canVoidOrder(cashier, { restaurantId: "r1", createdBy: null }),
    false,
  );
});
test("manager rights do not cross restaurant boundaries", () => {
  const manager = { restaurantId: "r1", userId: "u1", manager: true };
  assert.equal(
    canVoidOrder(manager, { restaurantId: "r1", createdBy: "u2" }),
    true,
  );
  assert.equal(
    canVoidOrder(manager, { restaurantId: "r1", createdBy: null }),
    true,
  );
  assert.equal(
    canVoidOrder(manager, { restaurantId: "r2", createdBy: "u1" }),
    false,
  );
});
