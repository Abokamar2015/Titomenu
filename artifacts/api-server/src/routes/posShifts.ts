import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, isNull, desc } from "drizzle-orm";
import {
  db,
  posOrdersTable,
  posShiftsTable,
  branchesTable,
  usersTable,
} from "@workspace/db";
import { summarizeShift, reconcileShift } from "../pos/shifts";
const router: IRouter = Router();
type Access = { restaurantId: string; userId: string; manager: boolean };
router.get("/shifts", async (req, res, next) => {
  const a = res.locals.posAccess as Access;
  if (req.query.all === "1" && !a.manager) {
    res.status(403).json({ error: "سجل جميع الموظفين للمدير فقط" });
    return;
  }
  try {
    const [active] = await db
      .select()
      .from(posShiftsTable)
      .where(
        and(
          eq(posShiftsTable.restaurantId, a.restaurantId),
          eq(posShiftsTable.userId, a.userId),
          isNull(posShiftsTable.closedAt),
        ),
      );
    const rows = active
      ? await db
          .select()
          .from(posOrdersTable)
          .where(
            and(
              eq(posOrdersTable.restaurantId, a.restaurantId),
              eq(posOrdersTable.shiftId, active.id),
            ),
          )
      : [];
    const history = await db
      .select({ shift: posShiftsTable, userName: usersTable.name })
      .from(posShiftsTable)
      .innerJoin(usersTable, eq(usersTable.id, posShiftsTable.userId))
      .where(
        and(
          eq(posShiftsTable.restaurantId, a.restaurantId),
          req.query.all === "1"
            ? undefined
            : eq(posShiftsTable.userId, a.userId),
        ),
      )
      .orderBy(desc(posShiftsTable.openedAt))
      .limit(100);
    res
      .set("Cache-Control", "no-store")
      .json({
        active: active || null,
        summary: active ? summarizeShift(active.openingMinor, rows) : null,
        history: history.map((x) => ({ ...x.shift, userName: x.userName })),
      });
  } catch (e) {
    next(e);
  }
});
const openInput = z.object({
  requestId: z.uuid(),
  branchId: z.uuid().nullable(),
  openingMinor: z.number().int().min(0).max(100000000),
});
router.post("/shifts/open", async (req, res, next) => {
  const a = res.locals.posAccess as Access,
    b = openInput.safeParse(req.body);
  if (!b.success) {
    res.status(400).json({ error: "تحقق من الفرع ورصيد بداية الصندوق" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [prior] = await tx
        .select()
        .from(posShiftsTable)
        .where(eq(posShiftsTable.id, b.data.requestId));
      if (prior) {
        if (prior.restaurantId !== a.restaurantId || prior.userId !== a.userId)
          return { status: 409, error: "معرف الوردية مستخدم" };
        return prior.closedAt
          ? { status: 409, error: "هذه الوردية مغلقة بالفعل" }
          : { status: 200, shift: prior };
      }
      const branches = await tx
        .select()
        .from(branchesTable)
        .where(eq(branchesTable.restaurantId, a.restaurantId));
      if (
        (branches.length && !b.data.branchId) ||
        (b.data.branchId && !branches.some((x) => x.id === b.data.branchId))
      )
        return { status: 400, error: "اختر فرعًا تابعًا للمطعم" };
      const [created] = await tx
        .insert(posShiftsTable)
        .values({
          id: b.data.requestId,
          restaurantId: a.restaurantId,
          userId: a.userId,
          branchId: b.data.branchId,
          openingMinor: b.data.openingMinor,
        })
        .onConflictDoNothing()
        .returning();
      if (created) return { status: 200, shift: created };
      const [active] = await tx
        .select()
        .from(posShiftsTable)
        .where(
          and(
            eq(posShiftsTable.restaurantId, a.restaurantId),
            eq(posShiftsTable.userId, a.userId),
            isNull(posShiftsTable.closedAt),
          ),
        );
      return active
        ? { status: 200, shift: active }
        : { status: 409, error: "تعذر فتح الوردية، حدّث الصفحة" };
    });
    res
      .status(result.status)
      .set("Cache-Control", "no-store")
      .json(result.error ? { error: result.error } : result.shift);
  } catch (e) {
    next(e);
  }
});
const closeInput = z.object({
  countedMinor: z.number().int().min(0).max(2000000000),
  note: z.string().trim().max(500).default(""),
});
router.post("/shifts/:shiftId/close", async (req, res, next) => {
  const a = res.locals.posAccess as Access,
    b = closeInput.safeParse(req.body),
    id = z.uuid().safeParse(req.params.shiftId);
  if (!b.success || !id.success) {
    res.status(400).json({ error: "تحقق من مبلغ الصندوق وملاحظة الإغلاق" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [shift] = await tx
        .select()
        .from(posShiftsTable)
        .where(
          and(
            eq(posShiftsTable.id, id.data),
            eq(posShiftsTable.restaurantId, a.restaurantId),
            eq(posShiftsTable.userId, a.userId),
          ),
        )
        .for("update");
      if (!shift) return { status: 404, error: "الوردية غير موجودة" };
      if (shift.closedAt) return { status: 200, shift };
      const orders = await tx
        .select()
        .from(posOrdersTable)
        .where(
          and(
            eq(posOrdersTable.restaurantId, a.restaurantId),
            eq(posOrdersTable.shiftId, shift.id),
          ),
        );
      const summary = summarizeShift(shift.openingMinor, orders),
        settlement = reconcileShift(
          summary.expectedMinor,
          b.data.countedMinor,
          b.data.note,
        );
      const [closed] = await tx
        .update(posShiftsTable)
        .set({ ...settlement, closedAt: new Date(), closingSummary: summary })
        .where(
          and(
            eq(posShiftsTable.id, shift.id),
            eq(posShiftsTable.restaurantId, a.restaurantId),
            isNull(posShiftsTable.closedAt),
          ),
        )
        .returning();
      return { status: 200, shift: closed };
    });
    res
      .status(result.status)
      .set("Cache-Control", "no-store")
      .json(result.error ? { error: result.error } : result.shift);
  } catch (e) {
    if (
      e instanceof Error &&
      [
        "أدخل تفسيرًا لفرق الصندوق (3 أحرف على الأقل)",
        "المبلغ المعدود غير صالح",
        "رصيد الصندوق يتجاوز الحد",
      ].includes(e.message)
    ) {
      res.status(400).json({ error: e.message });
      return;
    }
    next(e);
  }
});
export default router;
