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
import { restaurantsTable, branchesTable } from "./restaurants";
import { usersTable } from "./users";
export interface PosLine {
  id: string;
  name_ar: string;
  name_en: string;
  price_minor: number;
  qty: number;
}
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
