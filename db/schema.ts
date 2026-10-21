import { sql } from "drizzle-orm";
import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const orders = pgTable(
  "orders",
  {
    id: text().primaryKey(),
    productId: text("product_id").notNull(),
    email: text().notNull(),
    lang: text().notNull().default("en"),
    // Exact amount the customer must send (base price + unique suffix), in USDC base units.
    amountUnits: bigint("amount_units", { mode: "bigint" }).notNull(),
    chainId: integer("chain_id").notNull(),
    accessKeyHash: text("access_key_hash").notNull(),
    // pending | paid | expired
    status: text().notNull().default("pending"),
    // One transaction can only ever pay for one order.
    txHash: text("tx_hash").unique(),
    payerAddress: text("payer_address"),
    blockNumber: bigint("block_number", { mode: "number" }),
    lastError: text("last_error"),
    emailStatus: text("email_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    // Two open orders can never share an amount, so each payment maps to exactly one order.
    uniqueIndex("orders_pending_amount_idx").on(t.chainId, t.amountUnits).where(sql`${t.status} = 'pending'`),
    index("orders_status_expires_idx").on(t.status, t.expiresAt),
  ],
);

export const downloadTokens = pgTable(
  "download_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    downloads: integer().notNull().default(0),
    maxDownloads: integer("max_downloads").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("download_tokens_order_idx").on(t.orderId)],
);
