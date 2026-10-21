import inventoryStockRouter from "./inventoryStock";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { randomUUID } from "node:crypto";
import {
  and,
  eq,
  or,
  ilike,
  asc,
  desc,
  count,
  getTableColumns,
} from "drizzle-orm";
import {
  db,
  invSuppliersTable,
  invItemsTable,
  invMasterEventsTable,
  invMovementsTable,
  usersTable,
} from "@workspace/db";
import {
  supplierInput,
  itemInput,
  listInput,
  literalSearch,
} from "../inventory/validation";
const router: IRouter = Router();
// Mounted below the POS authentication, active-restaurant and membership checks.
router.use((req, res, next) => {
  if (!res.locals.posAccess?.manager) {
    res
      .status(403)
      .json({ error: "إدارة الموردين والمواد متاحة للمالك والمدير فقط" });
    return;
  }
  next();
});
router.use("/stock", inventoryStockRouter);
for (const kind of ["suppliers", "items"] as const) {
  const table = kind === "suppliers" ? invSuppliersTable : invItemsTable;
  const schema = kind === "suppliers" ? supplierInput : itemInput;
  router.get("/" + kind, async (req, res, next) => {
    const parsed = listInput.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "فلاتر البحث غير صالحة" });
      return;
    }
    const { status, search, offset } = parsed.data,
      rid = res.locals.posAccess.restaurantId as string;
    const where = and(
      eq(table.restaurantId, rid),
      status === "all" ? undefined : eq(table.isActive, status === "active"),
      search
        ? or(
            ilike(table.nameAr, literalSearch(search)),
            ilike(table.nameEn, literalSearch(search)),
            ilike(table.code, literalSearch(search)),
          )
        : undefined,
    );
    try {
      const [totals] = await db
        .select({ total: count() })
        .from(table)
        .where(where);
      const rows =
        kind === "items"
          ? await db
              .select({
                ...getTableColumns(invItemsTable),
                supplierName: invSuppliersTable.nameAr,
                supplierActive: invSuppliersTable.isActive,
              })
              .from(invItemsTable)
              .leftJoin(
                invSuppliersTable,
                and(
                  eq(invSuppliersTable.id, invItemsTable.supplierId),
                  eq(invSuppliersTable.restaurantId, rid),
                ),
              )
              .where(where)
              .orderBy(asc(table.nameAr), asc(table.id))
              .limit(50)
              .offset(offset)
          : await db
              .select()
              .from(invSuppliersTable)
              .where(where)
              .orderBy(asc(table.nameAr), asc(table.id))
              .limit(50)
              .offset(offset);
      res
        .set("Cache-Control", "no-store")
        .json({ rows, total: totals.total, limit: 50, offset });
    } catch (e) {
      next(e);
    }
  });
  router.get("/" + kind + "/:id/history", async (req, res, next) => {
    const id = z.uuid().safeParse(req.params.id),
      rid = res.locals.posAccess.restaurantId as string;
    if (!id.success) {
      res.status(400).json({ error: "المعرف غير صالح" });
      return;
    }
    try {
      const [entity] = await db
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.restaurantId, rid), eq(table.id, id.data)));
      if (!entity) {
        res.status(404).json({ error: "السجل غير موجود" });
        return;
      }
      const events = await db
        .select({
          id: invMasterEventsTable.id,
          action: invMasterEventsTable.action,
          userName: usersTable.name,
          createdAt: invMasterEventsTable.createdAt,
          beforeData: invMasterEventsTable.beforeData,
          afterData: invMasterEventsTable.afterData,
        })
        .from(invMasterEventsTable)
        .innerJoin(
          usersTable,
          eq(usersTable.id, invMasterEventsTable.createdBy),
        )
        .where(
          and(
            eq(invMasterEventsTable.restaurantId, rid),
            eq(invMasterEventsTable.entityType, kind),
            eq(invMasterEventsTable.entityId, id.data),
          ),
        )
        .orderBy(desc(invMasterEventsTable.createdAt))
        .limit(50);
      res.set("Cache-Control", "no-store").json({ events });
    } catch (e) {
      next(e);
    }
  });
  for (const update of [false, true]) {
    router.post("/" + kind + (update ? "/:id" : ""), async (req, res, next) => {
      const parsed = schema.safeParse(req.body),
        identity = z.uuid().safeParse(update ? req.params.id : req.body.id),
        version = z.number().int().positive().safeParse(req.body.version);
      if (
        !parsed.success ||
        !identity.success ||
        (update && !version.success)
      ) {
        res.status(400).json({
          error:
            "تحقق من الاسم والكود والوحدة والمبالغ والبريد؛ الكود حروف إنجليزية وأرقام وشرطة فقط",
        });
        return;
      }
      const a = res.locals.posAccess as {
          restaurantId: string;
          userId: string;
        },
        values = parsed.data;
      try {
        const result = await db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(table)
            .where(
              and(
                eq(table.restaurantId, a.restaurantId),
                eq(table.id, identity.data),
              ),
            )
            .for("update");
          if (update && (!existing || existing.version !== version.data))
            return {
              status: 409,
              error: "تغير السجل أو لم يعد موجودًا؛ حدّث القائمة وافتحه مجددًا",
            };
          if (!update && existing) {
            if (
              Object.entries(values).every(
                ([k, v]) => (existing as any)[k] === v,
              )
            )
              return { status: 200, row: existing };
            return {
              status: 409,
              error:
                "تم إنشاء هذا السجل سابقًا؛ حدّث القائمة قبل تكرار المحاولة",
            };
          }
          if (kind === "items") {
            const item = values as z.infer<typeof itemInput>;
            if (existing && "unit" in existing && existing.unit !== item.unit) {
              const [movement] = await tx
                .select({ id: invMovementsTable.id })
                .from(invMovementsTable)
                .where(
                  and(
                    eq(invMovementsTable.itemId, identity.data),
                    eq(invMovementsTable.restaurantId, a.restaurantId),
                  ),
                )
                .limit(1);
              if (movement)
                return {
                  status: 409,
                  error:
                    "لا يمكن تغيير وحدة مادة لها حركات مخزون؛ أنشئ مادة جديدة بالوحدة المطلوبة",
                };
            }
            if (item.supplierId) {
              const [supplier] = await tx
                .select()
                .from(invSuppliersTable)
                .where(
                  and(
                    eq(invSuppliersTable.id, item.supplierId),
                    eq(invSuppliersTable.restaurantId, a.restaurantId),
                  ),
                )
                .for("update");
              if (
                !supplier ||
                (!supplier.isActive &&
                  (!existing ||
                    !("supplierId" in existing) ||
                    existing.supplierId !== item.supplierId))
              )
                return {
                  status: 400,
                  error: "اختر موردًا نشطًا من المطعم نفسه",
                };
            }
          }
          let row;
          if (update) {
            // Both entities share version and audit fields; schema above validates entity-specific values.
            const [saved] = await tx
              .update(table)
              .set({
                ...values,
                version: existing!.version + 1,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(table.id, identity.data),
                  eq(table.restaurantId, a.restaurantId),
                  eq(table.version, version.data!),
                ),
              )
              .returning();
            row = saved;
          } else {
            const [saved] = await tx
              .insert(table)
              .values({
                ...values,
                id: identity.data,
                restaurantId: a.restaurantId,
                createdBy: a.userId,
              } as any)
              .returning();
            row = saved;
          }
          if (!row)
            return { status: 409, error: "تعارض في تحديث السجل؛ حدّث القائمة" };
          await tx.insert(invMasterEventsTable).values({
            id: randomUUID(),
            restaurantId: a.restaurantId,
            entityType: kind,
            entityId: identity.data,
            createdBy: a.userId,
            action: update ? "update" : "create",
            beforeData: existing || null,
            afterData: row,
          });
          return { status: update ? 200 : 201, row };
        });
        res
          .status(result.status)
          .set("Cache-Control", "no-store")
          .json(result.error ? { error: result.error } : result.row);
      } catch (e) {
        const err = e as { code?: string; cause?: { code?: string } };
        if (err.code === "23505" || err.cause?.code === "23505") {
          res.status(409).json({
            error:
              "الكود مستخدم في هذا المطعم؛ اختر كودًا آخر أو افتح السجل المؤرشف",
          });
          return;
        }
        next(e);
      }
    });
  }
}
export default router;
