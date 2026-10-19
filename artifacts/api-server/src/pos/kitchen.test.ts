import { test } from "node:test";
import assert from "node:assert/strict";
import { canAdvanceKitchen, kitchenStates } from "./kitchen";
test("only immediate forward transitions on paid orders are allowed", () => {
  for (let i = 0; i < 3; i++)
    assert.equal(
      canAdvanceKitchen(
        "paid",
        kitchenStates[i],
        kitchenStates[i],
        kitchenStates[i + 1],
      ),
      true,
    );
  for (const current of kitchenStates)
    for (const next of kitchenStates) {
      const valid =
        kitchenStates.indexOf(next) === kitchenStates.indexOf(current) + 1;
      assert.equal(canAdvanceKitchen("paid", current, current, next), valid);
      assert.equal(canAdvanceKitchen("voided", current, current, next), false);
    }
});
test("stale clients and invalid states cannot advance preparation", () => {
  assert.equal(canAdvanceKitchen("paid", "ready", "preparing", "ready"), false);
  assert.equal(canAdvanceKitchen("paid", "bad", "bad", "new"), false);
  assert.equal(
    canAdvanceKitchen("paid", "completed", "completed", "preparing"),
    false,
  );
});
