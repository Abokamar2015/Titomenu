import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { restaurantsTable, branchesTable } from "./restaurants";
import { usersTable } from "./users";
export interface PosLine {
  id: string;
  name_ar: string;
  name_en: string;
  price_minor: number;
  qty: number;
}
export const posShiftsTable = pgTable(
  "pos_shifts",
  {
    id: uuid("id").primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id").references(() => branchesTable.id, {
      onDelete: "set null",
    }),
    openingMinor: integer("opening_minor").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    countedMinor: integer("counted_minor"),
    expectedMinor: integer("expected_minor"),
    varianceMinor: integer("variance_minor"),
    closingNote: text("closing_note").notNull().default(""),
    closingSummary: jsonb("closing_summary").$type<{
      salesMinor: number;
      cashMinor: number;
      cardMinor: number;
      discountMinor: number;
      paidCount: number;
      voidedCount: number;
      expectedMinor: number;
    }>(),
  },
  (t) => [
    uniqueIndex("pos_shifts_one_active")
      .on(t.restaurantId, t.userId)
      .where(sql`${t.closedAt} IS NULL`),
    index("pos_shifts_restaurant_time").on(t.restaurantId, t.openedAt),
  ],
);
export const posOrdersTable = pgTable(
  "pos_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "restrict" }),
    branchId: uuid("branch_id").references(() => branchesTable.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    requestId: uuid("request_id").notNull(),
    shiftId: uuid("shift_id").references(() => posShiftsTable.id, {
      onDelete: "restrict",
    }),
    items: jsonb("items").$type<PosLine[]>().notNull(),
    totalMinor: integer("total_minor").notNull(),
    subtotalMinor: integer("subtotal_minor"),
    discountMinor: integer("discount_minor").notNull().default(0),
    discountReason: text("discount_reason").notNull().default(""),
    cashReceivedMinor: integer("cash_received_minor"),
    cardPaidMinor: integer("card_paid_minor"),
    payment: text("payment").notNull(),
    service: text("service").notNull(),
    note: text("note").notNull().default(""),
    status: text("status").notNull().default("paid"),
    voidReason: text("void_reason"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("pos_orders_request_unique").on(t.restaurantId, t.requestId),
    index("pos_orders_tenant_created").on(t.restaurantId, t.createdAt),
  ],
);
