import { test } from "node:test";
import assert from "node:assert/strict";
import { salesRange } from "./reports";
test("Riyadh inclusive dates include the full final day", () => {
  const r = salesRange("2026-10-01", "2026-10-31");
  assert.equal(r.start.toISOString(), "2026-09-30T21:00:00.000Z");
  assert.equal(r.end.toISOString(), "2026-10-31T21:00:00.000Z");
});
test("legacy single day works and invalid or excessive ranges fail", () => {
  assert.equal(
    salesRange("2026-10-19", undefined).end.getTime() -
      salesRange("2026-10-19", undefined).start.getTime(),
    86400000,
  );
  for (const [a, b] of [
    ["2026-02-30", "2026-03-01"],
    ["2026-10-02", "2026-10-01"],
    ["2026-01-01", "2026-02-01"],
    ["bad", "bad"],
  ])
    assert.throws(() => salesRange(a, b));
});
