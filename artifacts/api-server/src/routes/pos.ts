import { salesRange } from "../pos/reports";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { eq, and, desc, gte, lt, inArray, isNull } from "drizzle-orm";
import {
  db,
  restaurantsTable,
  branchesTable,
  menuItemsTable,
  posOrdersTable,
  posShiftsTable,
  posCashMovementsTable,
  membershipsTable,
} from "@workspace/db";
import {
  requireUser,
  requireRestaurantRole,
  type AuthedRequest,
} from "../lib/auth";
import { calculateOrder, calculateSettlement } from "../pos/checkout";
import { canManageProducts, canVoidOrder } from "../pos/permissions";
import { summarizeShift } from "../pos/shifts";
import movementsRouter from "./posCashMovements";
import shiftsRouter from "./posShifts";
const router: IRouter = Router();
const path = "/restaurants/:restaurantId/pos";
router.use(
  path,
  requireUser,
  requireRestaurantRole("owner", "manager", "staff"),
  async (req: AuthedRequest, res, next) => {
    try {
      const id = String(req.params.restaurantId);
      if (!z.uuid().safeParse(id).success) {
        res.status(400).json({ error: "معرف المطعم غير صالح" });
        return;
      }
      const [r] = await db
        .select()
        .from(restaurantsTable)
        .where(
          and(eq(restaurantsTable.id, id), eq(restaurantsTable.isActive, true)),
        );
      if (!r) {
        res.status(403).json({ error: "المطعم غير متاح" });
        return;
      }
      const [membership] = req.user!.isSuperAdmin
        ? []
        : await db
            .select()
            .from(membershipsTable)
            .where(
              and(
                eq(membershipsTable.restaurantId, id),
                eq(membershipsTable.userId, req.user!.id),
              ),
            );
      res.locals.posAccess = {
        restaurantId: id,
        userId: req.user!.id,
        manager: canManageProducts(
          membership?.role || null,
          req.user!.isSuperAdmin,
        ),
      };
      res.locals.restaurantId = id;
      next();
    } catch (e) {
      next(e);
    }
  },
);
router.use(path, shiftsRouter);
router.use(path, movementsRouter);
router.get(path + "/catalog", async (_req, res, next) => {
  try {
    const restaurantId = res.locals.restaurantId as string;
    const [products, branches] = await Promise.all([
      db
        .select()
        .from(menuItemsTable)
        .where(
          and(
            eq(menuItemsTable.restaurantId, restaurantId),
            eq(menuItemsTable.isAvailable, true),
          ),
        ),
      db
        .select()
        .from(branchesTable)
        .where(eq(branchesTable.restaurantId, restaurantId)),
    ]);
    res
      .set("Cache-Control", "no-store")
      .json({ products, branches, access: res.locals.posAccess });
  } catch (e) {
    next(e);
  }
});
const orderInput = z.object({
  requestId: z.uuid(),
  shiftId: z.uuid().nullable().default(null),
  branchId: z.uuid().nullable(),
  items: z
    .array(z.object({ id: z.uuid(), qty: z.number().int().min(1).max(999) }))
    .min(1)
    .max(100),
  payment: z.enum(["cash", "card", "mixed"]),
  service: z.enum(["takeaway", "dinein"]),
  note: z.string().max(300).default(""),
  cardPaidMinor: z
    .number()
    .int()
    .min(0)
    .max(100000000)
    .nullable()
    .default(null),
  discountMinor: z.number().int().min(0).max(100000000).default(0),
  discountReason: z.string().trim().max(300).default(""),
  cashReceivedMinor: z
    .number()
    .int()
    .min(0)
    .max(100000000)
    .nullable()
    .default(null),
});
router.post(path + "/orders", async (req: AuthedRequest, res, next) => {
  const parsed = orderInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "تحقق من بيانات الطلب والكميات والفرع" });
    return;
  }
  if (parsed.data.discountMinor > 0 && !res.locals.posAccess.manager) {
    res.status(403).json({ error: "الخصم متاح للمدير فقط" });
    return;
  }
  const b = parsed.data,
    restaurantId = res.locals.restaurantId as string;
  try {
    const saved = await db.transaction(async (tx) => {
      const [previous] = await tx
        .select()
        .from(posOrdersTable)
        .where(
          and(
            eq(posOrdersTable.restaurantId, restaurantId),
            eq(posOrdersTable.requestId, b.requestId),
          ),
        );
      if (previous) return previous;
      const [shift] = await tx
        .select()
        .from(posShiftsTable)
        .where(
          and(
            eq(posShiftsTable.restaurantId, restaurantId),
            eq(posShiftsTable.userId, req.user!.id),
            isNull(posShiftsTable.closedAt),
            b.shiftId ? eq(posShiftsTable.id, b.shiftId) : undefined,
          ),
        )
        .for("update");
      if (!shift) throw Error("افتح وردية قبل تسجيل البيع");
      if (shift.branchId !== b.branchId)
        throw Error("فرع الطلب مختلف عن فرع الوردية");
      const branches = await tx
        .select()
        .from(branchesTable)
        .where(eq(branchesTable.restaurantId, restaurantId));
      if (
        (branches.length > 0 && !b.branchId) ||
        (b.branchId && !branches.some((x) => x.id === b.branchId))
      )
        throw Error("اختر فرعًا تابعًا للمطعم");
      const products = await tx
        .select()
        .from(menuItemsTable)
        .where(
          and(
            eq(menuItemsTable.restaurantId, restaurantId),
            inArray(
              menuItemsTable.id,
              b.items.map((x) => x.id),
            ),
          ),
        )
        .for("share");
      const result = calculateOrder(b.items, products);
      const settlement = calculateSettlement(
        result.total,
        b,
        res.locals.posAccess.manager,
      );
      const [created] = await tx
        .insert(posOrdersTable)
        .values({
          restaurantId,
          branchId: b.branchId,
          createdBy: req.user!.id,
          requestId: b.requestId,
          shiftId: shift.id,
          items: result.lines,
          ...settlement,
          payment: b.payment,
          service: b.service,
          note: b.note,
        })
        .onConflictDoNothing({
          target: [posOrdersTable.restaurantId, posOrdersTable.requestId],
        })
        .returning();
      if (created) return created;
      const [concurrent] = await tx
        .select()
        .from(posOrdersTable)
        .where(
          and(
            eq(posOrdersTable.restaurantId, restaurantId),
            eq(posOrdersTable.requestId, b.requestId),
          ),
        );
      return concurrent;
    });
    res.set("Cache-Control", "no-store").json(saved);
  } catch (e) {
    if (
      e instanceof Error &&
      [
        "اختر فرعًا تابعًا للمطعم",
        "أحد الأصناف غير متاح",
        "سعر الصنف غير صالح",
        "كمية غير صالحة",
        "قيمة الطلب تتجاوز الحد",
        "أضف أصنافًا للطلب",
        "افتح وردية قبل تسجيل البيع",
        "فرع الطلب مختلف عن فرع الوردية",
        "الخصم يجب ألا يتجاوز قيمة الطلب",
        "أدخل جزء البطاقة أكبر من صفر وأقل من الإجمالي",
        "الخصم متاح للمدير فقط",
        "أدخل سبب الخصم (3 أحرف على الأقل)",
        "المبلغ المستلم أقل من الإجمالي أو غير صالح",
      ].includes(e.message)
    ) {
      res.status(400).json({ error: e.message });
      return;
    }
    next(e);
  }
});
router.post(
  path + "/orders/:orderId/void",
  async (req: AuthedRequest, res, next) => {
    const parsed = z
      .object({ reason: z.string().trim().min(3).max(300) })
      .safeParse(req.body);
    const id = z.uuid().safeParse(req.params.orderId);
    if (!parsed.success || !id.success) {
      res.status(400).json({ error: "أدخل سبب الإلغاء (3 أحرف على الأقل)" });
      return;
    }
    const access = res.locals.posAccess as {
      restaurantId: string;
      userId: string;
      manager: boolean;
    };
    try {
      const result = await db.transaction(async (tx) => {
        const [order] = await tx
          .select()
          .from(posOrdersTable)
          .where(
            and(
              eq(posOrdersTable.id, id.data),
              eq(posOrdersTable.restaurantId, access.restaurantId),
            ),
          )
          .for("update");
        if (!order) return { status: 404, error: "الطلب غير موجود" };
        if (!canVoidOrder(access, order))
          return { status: 403, error: "لا يمكنك إلغاء طلب موظف آخر" };
        if (order.status === "voided") return { status: 200, order };
        if (order.shiftId) {
          const [shift] = await tx
            .select()
            .from(posShiftsTable)
            .where(
              and(
                eq(posShiftsTable.id, order.shiftId),
                eq(posShiftsTable.restaurantId, access.restaurantId),
              ),
            )
            .for("update");
          if (!shift || shift.closedAt)
            return { status: 409, error: "لا يمكن إلغاء طلب من وردية مغلقة" };
          const refundCash =
            order.payment === "card"
              ? 0
              : order.totalMinor -
                (order.payment === "mixed" ? order.cardPaidMinor || 0 : 0);
          if (refundCash > 0) {
            const rows = await tx
              .select()
              .from(posOrdersTable)
              .where(
                and(
                  eq(posOrdersTable.restaurantId, access.restaurantId),
                  eq(posOrdersTable.shiftId, shift.id),
                ),
              );
            const movements = await tx
              .select()
              .from(posCashMovementsTable)
              .where(
                and(
                  eq(posCashMovementsTable.restaurantId, access.restaurantId),
                  eq(posCashMovementsTable.shiftId, shift.id),
                ),
              );
            if (
              summarizeShift(shift.openingMinor, rows, movements)
                .expectedMinor < refundCash
            )
              return {
                status: 409,
                error:
                  "رصيد الصندوق لا يكفي لرد النقد؛ سجّل إيداعًا فعليًا أولًا",
              };
          }
        }
        const [updated] = await tx
          .update(posOrdersTable)
          .set({
            status: "voided",
            voidReason: parsed.data.reason,
            voidedAt: new Date(),
            voidedBy: req.user!.id,
          })
          .where(
            and(
              eq(posOrdersTable.id, order.id),
              eq(posOrdersTable.restaurantId, access.restaurantId),
              eq(posOrdersTable.status, "paid"),
            ),
          )
          .returning();
        return { status: 200, order: updated };
      });
      res
        .status(result.status)
        .set("Cache-Control", "no-store")
        .json(result.error ? { error: result.error } : result.order);
    } catch (e) {
      next(e);
    }
  },
);
router.get(path + "/orders", async (req, res, next) => {
  let range;
  try {
    range = salesRange(req.query.date, req.query.to);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }
  if (
    req.query.to &&
    req.query.to !== req.query.date &&
    !res.locals.posAccess.manager
  ) {
    res.status(403).json({ error: "تقارير الفترات متاحة للمدير فقط" });
    return;
  }
  const { start, end } = range;
  const branch = z.uuid().safeParse(req.query.branchId);
  if (req.query.branchId && !branch.success) {
    res.status(400).json({ error: "الفرع غير صالح" });
    return;
  }
  try {
    const orders = await db
      .select()
      .from(posOrdersTable)
      .where(
        and(
          eq(posOrdersTable.restaurantId, res.locals.restaurantId),
          gte(posOrdersTable.createdAt, start),
          lt(posOrdersTable.createdAt, end),
          branch.success ? eq(posOrdersTable.branchId, branch.data) : undefined,
        ),
      )
      .orderBy(desc(posOrdersTable.createdAt))
      .limit(1001);
    res
      .set("Cache-Control", "no-store")
      .json({ orders: orders.slice(0, 1000), truncated: orders.length > 1000 });
  } catch (e) {
    next(e);
  }
});
export default router;
