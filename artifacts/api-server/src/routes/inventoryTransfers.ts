import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  invItemsTable,
  invBalancesTable,
  invMovementsTable,
  invTransfersTable,
  branchesTable,
} from "@workspace/db";
import { quantityMilli, transferChange } from "../inventory/stock";
const router: IRouter = Router();
const input = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  fromBranchId: z.uuid().nullable(),
  toBranchId: z.uuid().nullable(),
  expectedUnit: z.enum(["g", "kg", "ml", "l", "pcs", "pack"]),
  expectedVersion: z.number().int().min(0).max(2147483646),
  quantity: z.string().max(20),
  reason: z.string().trim().min(3).max(500),
});
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function balanceAt(
  tx: Tx,
  rid: string,
  itemId: string,
  branchId: string | null,
) {
  const locationKey = branchId || "none";
  let [balance] = await tx
    .select()
    .from(invBalancesTable)
    .where(
      and(
        eq(invBalancesTable.restaurantId, rid),
        eq(invBalancesTable.itemId, itemId),
        eq(invBalancesTable.locationKey, locationKey),
      ),
    )
    .for("update");
  if (!balance)
    [balance] = await tx
      .insert(invBalancesTable)
      .values({
        id: randomUUID(),
        restaurantId: rid,
        itemId,
        branchId,
        locationKey,
      })
      .returning();
  return balance;
}
router.post("/transfers", async (req, res, next) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "تحقق من المادة والموقعين والكمية وسبب التحويل" });
    return;
  }
  const b = parsed.data,
    a = res.locals.posAccess as { restaurantId: string; userId: string };
  let amount: number;
  try {
    amount = quantityMilli(b.quantity);
    if (!amount) throw Error("أدخل كمية تحويل موجبة");
    if (b.fromBranchId === b.toBranchId)
      throw Error("اختر موقع وجهة يختلف عن المصدر");
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      // All manual movements and item edits also lock this item first.
      const [item] = await tx
        .select()
        .from(invItemsTable)
        .where(
          and(
            eq(invItemsTable.id, b.itemId),
            eq(invItemsTable.restaurantId, a.restaurantId),
          ),
        )
        .for("update");
      if (!item) return { status: 404, error: "المادة غير موجودة" };
      const [prior] = await tx
        .select()
        .from(invTransfersTable)
        .where(eq(invTransfersTable.id, b.id));
      if (prior) {
        if (
          prior.restaurantId === a.restaurantId &&
          prior.itemId === b.itemId &&
          prior.createdBy === a.userId &&
          prior.fromBranchId === b.fromBranchId &&
          prior.toBranchId === b.toBranchId &&
          prior.quantityMilli === amount &&
          prior.unit === b.expectedUnit &&
          prior.reason === b.reason
        )
          return { status: 200, transfer: prior };
        return { status: 409, error: "معرف التحويل مستخدم؛ حدّث القائمة" };
      }
      if (!item.isActive)
        return { status: 409, error: "أعد تنشيط المادة قبل التحويل" };
      if (item.unit !== b.expectedUnit)
        return {
          status: 409,
          error: "تغيرت وحدة المادة؛ حدّث القائمة قبل التحويل",
        };
      const branchIds = [b.fromBranchId, b.toBranchId]
        .filter((x): x is string => !!x)
        .sort();
      if (branchIds.length) {
        const valid = await tx
          .select({ id: branchesTable.id })
          .from(branchesTable)
          .where(
            and(
              eq(branchesTable.restaurantId, a.restaurantId),
              inArray(branchesTable.id, branchIds),
            ),
          )
          .orderBy(branchesTable.id)
          .for("share");
        if (valid.length !== branchIds.length)
          return { status: 400, error: "اختر فروعًا من المطعم نفسه" };
      }
      const source = await balanceAt(
        tx,
        a.restaurantId,
        b.itemId,
        b.fromBranchId,
      );
      if (source.version !== b.expectedVersion)
        return {
          status: 409,
          error: "تغير رصيد المصدر؛ حدّث القائمة وافتح التحويل مجددًا",
        };
      const destination = await balanceAt(
        tx,
        a.restaurantId,
        b.itemId,
        b.toBranchId,
      );
      const change = transferChange(
        source.quantityMilli,
        destination.quantityMilli,
        amount,
        source.locationKey,
        destination.locationKey,
      );
      const [transfer] = await tx
        .insert(invTransfersTable)
        .values({
          id: b.id,
          restaurantId: a.restaurantId,
          itemId: b.itemId,
          fromBranchId: b.fromBranchId,
          toBranchId: b.toBranchId,
          fromLocationKey: source.locationKey,
          toLocationKey: destination.locationKey,
          quantityMilli: amount,
          unit: item.unit,
          reason: b.reason,
          createdBy: a.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (!transfer)
        return { status: 409, error: "تعارض في تسجيل التحويل؛ حدّث القائمة" };
      const common = {
        restaurantId: a.restaurantId,
        itemId: b.itemId,
        inputQuantityMilli: amount,
        unit: item.unit,
        reason: b.reason,
        createdBy: a.userId,
        transferId: transfer.id,
      };
      await tx.insert(invMovementsTable).values([
        {
          ...common,
          id: randomUUID(),
          branchId: b.fromBranchId,
          locationKey: source.locationKey,
          kind: "issue",
          ...change.source,
        },
        {
          ...common,
          id: randomUUID(),
          branchId: b.toBranchId,
          locationKey: destination.locationKey,
          kind: "receipt",
          ...change.destination,
        },
      ]);
      for (const [balance, after] of [
        [source, change.source.afterMilli],
        [destination, change.destination.afterMilli],
      ] as const)
        await tx
          .update(invBalancesTable)
          .set({
            quantityMilli: after,
            version: balance.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(invBalancesTable.id, balance.id));
      return { status: 201, transfer };
    });
    res
      .status(result.status)
      .set("Cache-Control", "no-store")
      .json(result.error ? { error: result.error } : result.transfer);
  } catch (e) {
    if (
      e instanceof Error &&
      [
        "اختر موقع وجهة يختلف عن المصدر",
        "كمية غير صالحة",
        "اختر نوع حركة وكمية موجبة",
        "الرصيد لا يكفي للصرف أو الإتلاف",
        "رصيد المادة يتجاوز مليون وحدة",
      ].includes(e.message)
    ) {
      res.status(400).json({ error: e.message });
      return;
    }
    next(e);
  }
});
export default router;
