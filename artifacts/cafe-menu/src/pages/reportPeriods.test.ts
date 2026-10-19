import { test } from "node:test";
import assert from "node:assert/strict";
import { reportPeriod } from "./reportPeriods";
test("period shortcuts cross month, year and leap-day boundaries", () => {
  assert.deepEqual(reportPeriod("2026-01-01", "yesterday"), {
    from: "2025-12-31",
    to: "2025-12-31",
  });
  assert.deepEqual(reportPeriod("2024-03-01", "week"), {
    from: "2024-02-24",
    to: "2024-03-01",
  });
  assert.deepEqual(reportPeriod("2026-10-19", "month"), {
    from: "2026-10-01",
    to: "2026-10-19",
  });
  assert.deepEqual(reportPeriod("2026-10-19", "today"), {
    from: "2026-10-19",
    to: "2026-10-19",
  });
});
