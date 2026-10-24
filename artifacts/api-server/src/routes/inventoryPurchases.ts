import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { randomUUID, createHash } from "node:crypto";
import {
  and,
  eq,
  or,
  ilike,
  inArray,
  asc,
  desc,
  count,
  gte,
  lte,
} from "drizzle-orm";
import {
  db,
  invPurchasesTable,
  invSuppliersTable,
  invItemsTable,
  invBalancesTable,
  invMovementsTable,
  branchesTable,
  type PurchaseLine,
} from "@workspace/db";
import {
  purchaseInput,
  purchaseAmounts,
  purchaseListInput,
} from "../inventory/purchases";
import { stockChange } from "../inventory/stock";
import { literalSearch } from "../inventory/validation";
const router: IRouter = Router();
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function balanceAt(
  tx: Tx,
  rid: string,
  itemId: string,
  branchId: string | null,
) {
  let [b] = await tx
    .select()
    .from(invBalancesTable)
    .where(
      and(
        eq(invBalancesTable.restaurantId, rid),
        eq(invBalancesTable.itemId, itemId),
        eq(invBalancesTable.locationKey, branchId || "none"),
      ),
    )
    .for("update");
  if (!b)
    [b] = await tx
      .insert(invBalancesTable)
      .values({
        id: randomUUID(),
        restaurantId: rid,
        itemId,
        branchId,
        locationKey: branchId || "none",
      })
      .returning();
  return b;
}
router.get("/", async (req, res, next) => {
  const q = purchaseListInput.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: "فلاتر المشتريات غير صالحة" });
    return;
  }
  const rid = res.locals.posAccess.restaurantId as string;
  try {
    const where = and(
      eq(invPurchasesTable.restaurantId, rid),
      q.data.supplierId
        ? eq(invPurchasesTable.supplierId, q.data.supplierId)
        : undefined,
      q.data.from
        ? gte(invPurchasesTable.documentDate, q.data.from)
        : undefined,
      q.data.to ? lte(invPurchasesTable.documentDate, q.data.to) : undefined,
      q.data.status === "all"
        ? undefined
        : eq(invPurchasesTable.status, q.data.status),
      q.data.search
        ? or(
            ilike(invPurchasesTable.reference, literalSearch(q.data.search)),
            ilike(invPurchasesTable.supplierName, literalSearch(q.data.search)),
          )
        : undefined,
    );
    const [totals] = await db
      .select({ total: count() })
      .from(invPurchasesTable)
      .where(where);
    const rows = await db
      .select({
        id: invPurchasesTable.id,
        reference: invPurchasesTable.reference,
        supplierName: invPurchasesTable.supplierName,
        supplierId: invPurchasesTable.supplierId,
        branchId: invPurchasesTable.branchId,
        documentDate: invPurchasesTable.documentDate,
        totalMinor: invPurchasesTable.totalMinor,
        status: invPurchasesTable.status,
        createdAt: invPurchasesTable.createdAt,
      })
      .from(invPurchasesTable)
      .where(where)
      .orderBy(desc(invPurchasesTable.createdAt), desc(invPurchasesTable.id))
      .limit(50)
      .offset(q.data.offset);
    res.set("Cache-Control", "no-store").json({ rows, total: totals.total });
  } catch (e) {
    next(e);
  }
});
router.get("/:id", async (req, res, next) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "معرف المستند غير صالح" });
    return;
  }
  try {
    const [row] = await db
      .select()
      .from(invPurchasesTable)
      .where(
        and(
          eq(invPurchasesTable.id, id.data),
          eq(invPurchasesTable.restaurantId, res.locals.posAccess.restaurantId),
        ),
      );
    if (!row) {
      res.status(404).json({ error: "المستند غير موجود" });
      return;
    }
    res.set("Cache-Control", "no-store").json(row);
  } catch (e) {
    next(e);
  }
});
router.post("/", async (req, res, next) => {
  const parsed = purchaseInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "تحقق من المورد والتاريخ والمرجع والمواد والكميات والتكلفة",
    });
    return;
  }
  const b = parsed.data,
    a = res.locals.posAccess as { restaurantId: string; userId: string };
  let calculated: ReturnType<typeof purchaseAmounts>;
  try {
    calculated = purchaseAmounts(b.items);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        ...b,
        items: b.items.map((x, i) => ({
          ...x,
          quantity: calculated.lines[i].quantityMilli,
        })),
      }),
    )
    .digest("hex");
  try {
    const result = await db.transaction(async (tx) => {
      const [prior] = await tx
        .select()
        .from(invPurchasesTable)
        .where(eq(invPurchasesTable.id, b.id));
      if (prior) {
        if (
          prior.restaurantId === a.restaurantId &&
          prior.createdBy === a.userId &&
          prior.requestHash === hash
        )
          return { status: 200, row: prior };
        return { status: 409, error: "معرف المستند مستخدم؛ حدّث القائمة" };
      }
      const ids = b.items.map((x) => x.itemId).sort();
      const materials = await tx
        .select()
        .from(invItemsTable)
        .where(
          and(
            eq(invItemsTable.restaurantId, a.restaurantId),
            inArray(invItemsTable.id, ids),
          ),
        )
        .orderBy(asc(invItemsTable.id))
        .for("update");
      if (materials.length !== ids.length || materials.some((x) => !x.isActive))
        return { status: 400, error: "اختر مواد نشطة من المطعم نفسه" };
      const [supplier] = await tx
        .select()
        .from(invSuppliersTable)
        .where(
          and(
            eq(invSuppliersTable.id, b.supplierId),
            eq(invSuppliersTable.restaurantId, a.restaurantId),
          ),
        )
        .for("share");
      if (!supplier?.isActive)
        return { status: 400, error: "اختر موردًا نشطًا من المطعم نفسه" };
      if (b.branchId) {
        const [branch] = await tx
          .select({ id: branchesTable.id })
          .from(branchesTable)
          .where(
            and(
              eq(branchesTable.id, b.branchId),
              eq(branchesTable.restaurantId, a.restaurantId),
            ),
          )
          .for("share");
        if (!branch)
          return { status: 400, error: "الفرع غير موجود في هذا المطعم" };
      }
      const lines: PurchaseLine[] = [];
      for (const [i, line] of calculated.lines.entries()) {
        const item = materials.find((x) => x.id === line.itemId)!;
        if (item.unit !== b.items[i].expectedUnit)
          return {
            status: 409,
            error: "تغيرت وحدة مادة؛ أعد فتح مستند الاستلام",
          };
        lines.push({
          itemId: item.id,
          code: item.code,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          unit: item.unit,
          quantityMilli: line.quantityMilli,
          unitCostMinor: line.unitCostMinor,
          lineTotalMinor: line.lineTotalMinor,
        });
      }
      const [row] = await tx
        .insert(invPurchasesTable)
        .values({
          id: b.id,
          restaurantId: a.restaurantId,
          supplierId: b.supplierId,
          supplierName: supplier.nameAr,
          supplierCode: supplier.code,
          branchId: b.branchId,
          locationKey: b.branchId || "none",
          reference: b.reference,
          documentDate: b.documentDate,
          items: lines,
          totalMinor: calculated.totalMinor,
          notes: b.notes,
          requestHash: hash,
          createdBy: a.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row)
        return {
          status: 409,
          error: "مرجع المورد مسجل سابقًا؛ راجع المستندات قبل التكرار",
        };
      for (const line of [...lines].sort((x, y) =>
        x.itemId.localeCompare(y.itemId),
      )) {
        const balance = await balanceAt(
          tx,
          a.restaurantId,
          line.itemId,
          b.branchId,
        );
        const change = stockChange(
          balance.quantityMilli,
          "receipt",
          line.quantityMilli,
        );
        await tx.insert(invMovementsTable).values({
          id: randomUUID(),
          restaurantId: a.restaurantId,
          itemId: line.itemId,
          branchId: b.branchId,
          locationKey: b.branchId || "none",
          purchaseId: row.id,
          kind: "receipt",
          inputQuantityMilli: line.quantityMilli,
          ...change,
          unit: line.unit,
          reason: `استلام مشتريات ${b.reference}`,
          createdBy: a.userId,
        });
        await tx
          .update(invBalancesTable)
          .set({
            quantityMilli: change.afterMilli,
            version: balance.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(invBalancesTable.id, balance.id));
      }
      return { status: 201, row };
    });
    res
      .status(result.status)
      .set("Cache-Control", "no-store")
      .json(result.error ? { error: result.error } : result.row);
  } catch (e) {
    if (e instanceof Error && e.message === "رصيد المادة يتجاوز مليون وحدة") {
      res.status(400).json({ error: e.message });
      return;
    }
    next(e);
  }
});
router.post("/:id/cancel", async (req, res, next) => {
  const id = z.uuid().safeParse(req.params.id),
    reason = z.string().trim().min(3).max(500).safeParse(req.body.reason);
  if (!id.success || !reason.success) {
    res.status(400).json({ error: "أدخل سبب الإلغاء (3 أحرف على الأقل)" });
    return;
  }
  const a = res.locals.posAccess as { restaurantId: string; userId: string };
  try {
    const result = await db.transaction(async (tx) => {
      const [doc] = await tx
        .select()
        .from(invPurchasesTable)
        .where(
          and(
            eq(invPurchasesTable.id, id.data),
            eq(invPurchasesTable.restaurantId, a.restaurantId),
          ),
        )
        .for("update");
      if (!doc) return { status: 404, error: "المستند غير موجود" };
      if (doc.status === "cancelled") return { status: 200, row: doc };
      const lines = [...doc.items].sort((x, y) =>
        x.itemId.localeCompare(y.itemId),
      );
      await tx
        .select({ id: invItemsTable.id })
        .from(invItemsTable)
        .where(
          and(
            eq(invItemsTable.restaurantId, a.restaurantId),
            inArray(
              invItemsTable.id,
              lines.map((x) => x.itemId),
            ),
          ),
        )
        .orderBy(asc(invItemsTable.id))
        .for("update");
      for (const line of lines) {
        const balance = await balanceAt(
          tx,
          a.restaurantId,
          line.itemId,
          doc.branchId,
        );
        const change = stockChange(
          balance.quantityMilli,
          "issue",
          line.quantityMilli,
        );
        await tx.insert(invMovementsTable).values({
          id: randomUUID(),
          restaurantId: a.restaurantId,
          itemId: line.itemId,
          branchId: doc.branchId,
          locationKey: doc.locationKey,
          purchaseId: doc.id,
          kind: "issue",
          inputQuantityMilli: line.quantityMilli,
          ...change,
          unit: line.unit,
          reason: `إلغاء مشتريات ${doc.reference}: ${reason.data}`.slice(
            0,
            500,
          ),
          createdBy: a.userId,
        });
        await tx
          .update(invBalancesTable)
          .set({
            quantityMilli: change.afterMilli,
            version: balance.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(invBalancesTable.id, balance.id));
      }
      const [row] = await tx
        .update(invPurchasesTable)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledBy: a.userId,
          cancellationReason: reason.data,
        })
        .where(eq(invPurchasesTable.id, doc.id))
        .returning();
      return { status: 200, row };
    });
    res
      .status(result.status)
      .set("Cache-Control", "no-store")
      .json(result.error ? { error: result.error } : result.row);
  } catch (e) {
    if (e instanceof Error && e.message === "الرصيد لا يكفي للصرف أو الإتلاف") {
      res.status(409).json({
        error:
          "الرصيد الحالي لا يكفي لعكس استلام المشتريات؛ راجع الكمية الفعلية والحركات اللاحقة",
      });
      return;
    }
    next(e);
  }
});
export default router;
