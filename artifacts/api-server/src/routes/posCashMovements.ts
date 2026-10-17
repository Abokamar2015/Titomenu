import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  posShiftsTable,
  posOrdersTable,
  posCashMovementsTable,
  usersTable,
} from "@workspace/db";
import { summarizeShift } from "../pos/shifts";
const router: IRouter = Router();
type Access = { restaurantId: string; userId: string; manager: boolean };
router.get("/shifts/:shiftId/movements", async (req, res, next) => {
  const a = res.locals.posAccess as Access,
    id = z.uuid().safeParse(req.params.shiftId);
  if (!id.success) {
    res.status(400).json({ error: "معرف الوردية غير صالح" });
    return;
  }
  try {
    const [shift] = await db
      .select()
      .from(posShiftsTable)
      .where(
        and(
          eq(posShiftsTable.id, id.data),
          eq(posShiftsTable.restaurantId, a.restaurantId),
        ),
      );
    if (!shift || (!a.manager && shift.userId !== a.userId)) {
      res.status(404).json({ error: "الوردية غير موجودة" });
      return;
    }
    const rows = await db
      .select({ movement: posCashMovementsTable, userName: usersTable.name })
      .from(posCashMovementsTable)
      .innerJoin(usersTable, eq(usersTable.id, posCashMovementsTable.createdBy))
      .where(
        and(
          eq(posCashMovementsTable.restaurantId, a.restaurantId),
          eq(posCashMovementsTable.shiftId, shift.id),
        ),
      )
      .orderBy(desc(posCashMovementsTable.createdAt));
    const reversed = new Set(
      rows.map((x) => x.movement.reversesId).filter(Boolean),
    );
    res
      .set("Cache-Control", "no-store")
      .json({
        shift,
        rows: rows
          .slice(0, 100)
          .map((x) => ({
            ...x.movement,
            userName: x.userName,
            reversed: reversed.has(x.movement.id),
          })),
        truncated: rows.length > 100,
      });
  } catch (e) {
    next(e);
  }
});
const input = z.object({
  requestId: z.uuid(),
  kind: z.enum(["in", "out", "expense"]),
  amountMinor: z.number().int().positive().max(100000000),
  reason: z.string().trim().min(3).max(500),
});
const reverseInput = z.object({
  requestId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});
router.post("/shifts/:shiftId/movements", async (req, res, next) => {
  const b = input.safeParse(req.body),
    id = z.uuid().safeParse(req.params.shiftId);
  if (!b.success || !id.success) {
    res
      .status(400)
      .json({
        error: "أدخل نوع الحركة ومبلغًا موجبًا وسببًا من 3 أحرف على الأقل",
      });
    return;
  }
  await record(res.locals.posAccess, id.data, b.data, null, res, next);
});
router.post(
  "/shifts/:shiftId/movements/:movementId/reverse",
  async (req, res, next) => {
    const b = reverseInput.safeParse(req.body),
      id = z.uuid().safeParse(req.params.shiftId),
      mid = z.uuid().safeParse(req.params.movementId);
    if (!b.success || !id.success || !mid.success) {
      res.status(400).json({ error: "تحقق من معرف الحركة وسبب التصحيح" });
      return;
    }
    await record(
      res.locals.posAccess,
      id.data,
      { ...b.data, kind: "in", amountMinor: 1 },
      mid.data,
      res,
      next,
    );
  },
);
async function record(
  a: Access,
  shiftId: string,
  b: {
    requestId: string;
    reason: string;
    kind: "in" | "out" | "expense";
    amountMinor: number;
  },
  reverseId: string | null,
  res: any,
  next: any,
) {
  try {
    const result = await db.transaction(async (tx) => {
      const [prior] = await tx
        .select()
        .from(posCashMovementsTable)
        .where(eq(posCashMovementsTable.id, b.requestId));
      if (prior) {
        if (
          prior.restaurantId !== a.restaurantId ||
          prior.shiftId !== shiftId ||
          prior.createdBy !== a.userId
        )
          return { status: 409, error: "معرف الحركة مستخدم" };
        return { status: 200, movement: prior };
      }
      const [shift] = await tx
        .select()
        .from(posShiftsTable)
        .where(
          and(
            eq(posShiftsTable.id, shiftId),
            eq(posShiftsTable.restaurantId, a.restaurantId),
          ),
        )
        .for("update");
      if (!shift || (!a.manager && shift.userId !== a.userId))
        return { status: 404, error: "الوردية غير موجودة" };
      if (shift.closedAt)
        return { status: 409, error: "الوردية مغلقة، لا يمكن تغيير حركاتها" };
      let kind = b.kind,
        amountMinor = b.amountMinor;
      if (reverseId) {
        const [original] = await tx
          .select()
          .from(posCashMovementsTable)
          .where(
            and(
              eq(posCashMovementsTable.id, reverseId),
              eq(posCashMovementsTable.shiftId, shiftId),
              eq(posCashMovementsTable.restaurantId, a.restaurantId),
            ),
          );
        if (!original || original.reversesId)
          return { status: 400, error: "الحركة الأصلية غير قابلة للتصحيح" };
        const [already] = await tx
          .select()
          .from(posCashMovementsTable)
          .where(eq(posCashMovementsTable.reversesId, reverseId));
        if (already) return { status: 200, movement: already };
        kind = original.kind === "in" ? "out" : "in";
        amountMinor = original.amountMinor;
      }
      const rows = await tx
          .select()
          .from(posOrdersTable)
          .where(
            and(
              eq(posOrdersTable.restaurantId, a.restaurantId),
              eq(posOrdersTable.shiftId, shiftId),
            ),
          ),
        movements = await tx
          .select()
          .from(posCashMovementsTable)
          .where(
            and(
              eq(posCashMovementsTable.restaurantId, a.restaurantId),
              eq(posCashMovementsTable.shiftId, shiftId),
            ),
          );
      summarizeShift(shift.openingMinor, rows, [
        ...movements,
        { id: b.requestId, kind, amountMinor, reversesId: reverseId },
      ]);
      const [created] = await tx
        .insert(posCashMovementsTable)
        .values({
          id: b.requestId,
          restaurantId: a.restaurantId,
          shiftId,
          createdBy: a.userId,
          kind,
          amountMinor,
          reason: b.reason,
          reversesId: reverseId,
        })
        .onConflictDoNothing()
        .returning();
      if (!created)
        return { status: 409, error: "تعارض في تسجيل الحركة، حدّث السجل" };
      return { status: 200, movement: created };
    });
    res
      .status(result.status)
      .set("Cache-Control", "no-store")
      .json(result.error ? { error: result.error } : result.movement);
  } catch (e) {
    if (
      e instanceof Error &&
      [
        "رصيد الصندوق لا يكفي لهذه العملية",
        "رصيد الصندوق يتجاوز الحد",
        "حركة نقد غير صالحة",
      ].includes(e.message)
    ) {
      res.status(400).json({ error: e.message });
      return;
    }
    next(e);
  }
}
export default router;
