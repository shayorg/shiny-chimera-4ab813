import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { downloadTokens, orders } from "../db/schema.ts";
import { createRpc, isTxHash, verifyUsdcPayment, type VerifyResult } from "./chain.ts";
import { getNetwork, RECIPIENT } from "./network.ts";
import { formatUnits, type Product } from "./products.ts";
import { newSecret, randomSuffix, safeEqual, sha256 } from "./secrets.ts";

export const ORDER_TTL_MS = 60 * 60 * 1000;
export const DOWNLOAD_TTL_HOURS = 24;
export const MAX_DOWNLOADS_PER_LINK = 5;
export const MAX_LINKS_PER_ORDER = 10;

export type Order = typeof orders.$inferSelect;

function isUniqueViolation(err: unknown): boolean {
  for (let e: any = err; e; e = e.cause) if (e.code === "23505") return true;
  return false;
}

export async function createOrder(product: Product, email: string, lang: string) {
  const network = getNetwork();
  // Release amounts held by abandoned orders so they can be reused.
  await db
    .update(orders)
    .set({ status: "expired" })
    .where(and(eq(orders.status, "pending"), lt(orders.expiresAt, new Date())));

  const accessKey = newSecret();
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = crypto.randomUUID();
    const amountUnits = BigInt(product.priceUnits + randomSuffix());
    try {
      const [order] = await db
        .insert(orders)
        .values({
          id,
          productId: product.id,
          email,
          lang,
          amountUnits,
          chainId: network.chainId,
          accessKeyHash: sha256(accessKey),
          expiresAt: new Date(Date.now() + ORDER_TTL_MS),
        })
        .returning();
      return { order, accessKey };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error("Could not allocate a unique payment amount");
}

export async function getOrderForKey(id: string, accessKey: string | null): Promise<Order | null> {
  if (!accessKey || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order || !safeEqual(order.accessKeyHash, sha256(accessKey))) return null;
  return order;
}

export function publicOrder(o: Order) {
  const network = getNetwork();
  const expired = o.status === "pending" && o.expiresAt < new Date();
  return {
    id: o.id,
    productId: o.productId,
    status: expired ? "expired" : o.status,
    amount: formatUnits(o.amountUnits),
    amountUnits: o.amountUnits.toString(),
    recipient: RECIPIENT,
    usdc: network.usdc,
    chainId: o.chainId,
    networkName: network.name,
    explorer: network.explorer,
    txHash: o.txHash,
    lastError: o.lastError,
    emailStatus: o.emailStatus,
    createdAt: o.createdAt.toISOString(),
    expiresAt: o.expiresAt.toISOString(),
    paidAt: o.paidAt?.toISOString() ?? null,
  };
}

export type VerifyOutcome =
  | { ok: true; order: Order; newlyPaid: boolean }
  | { ok: false; status: number; code: string; message: string; retryable: boolean };

export async function verifyOrderPayment(order: Order, txHashInput: string): Promise<VerifyOutcome> {
  if (order.status === "paid") {
    if (order.txHash === txHashInput.toLowerCase()) return { ok: true, order, newlyPaid: false };
    return { ok: false, status: 409, code: "already_paid", message: "This order is already paid.", retryable: false };
  }
  if (!isTxHash(txHashInput)) {
    return { ok: false, status: 400, code: "invalid_hash", message: "Invalid transaction hash.", retryable: false };
  }
  const txHash = txHashInput.toLowerCase();
  const network = getNetwork();
  if (order.chainId !== network.chainId) {
    return { ok: false, status: 409, code: "wrong_network", message: "Order was created for a different network.", retryable: false };
  }

  const [usedBy] = await db.select({ id: orders.id }).from(orders).where(eq(orders.txHash, txHash));
  if (usedBy) {
    return { ok: false, status: 409, code: "tx_already_used", message: "This transaction has already been used for an order.", retryable: false };
  }

  const result: VerifyResult = await verifyUsdcPayment(createRpc(network.rpcUrl), txHash, {
    chainId: network.chainId,
    usdc: network.usdc,
    recipient: RECIPIENT,
    amountUnits: order.amountUnits,
    notBefore: order.createdAt,
    notAfter: order.expiresAt,
    minConfirmations: network.minConfirmations,
  });

  if (!result.ok) {
    await db.update(orders).set({ lastError: result.code }).where(eq(orders.id, order.id));
    const status = result.retryable ? (result.code === "rpc_error" ? 502 : 202) : 422;
    return { ok: false, status, code: result.code, message: result.message, retryable: result.retryable };
  }

  try {
    // Conditional update: only an unpaid order without a bound transaction can be marked paid,
    // and the unique tx_hash constraint stops one transaction from paying two orders.
    const [paid] = await db
      .update(orders)
      .set({
        status: "paid",
        txHash,
        payerAddress: result.payer,
        blockNumber: result.blockNumber,
        paidAt: new Date(),
        lastError: null,
      })
      .where(and(eq(orders.id, order.id), inArray(orders.status, ["pending", "expired"]), isNull(orders.txHash)))
      .returning();
    if (!paid) {
      const [current] = await db.select().from(orders).where(eq(orders.id, order.id));
      if (current?.status === "paid" && current.txHash === txHash) return { ok: true, order: current, newlyPaid: false };
      return { ok: false, status: 409, code: "already_paid", message: "This order is already paid.", retryable: false };
    }
    return { ok: true, order: paid, newlyPaid: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, status: 409, code: "tx_already_used", message: "This transaction has already been used for an order.", retryable: false };
    }
    throw err;
  }
}

export async function issueDownloadToken(order: Order): Promise<{ token: string; expiresAt: Date } | null> {
  if (order.status !== "paid") return null;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(downloadTokens)
    .where(eq(downloadTokens.orderId, order.id));
  if (count >= MAX_LINKS_PER_ORDER) return null;
  const token = newSecret();
  const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_HOURS * 3600_000);
  await db.insert(downloadTokens).values({
    tokenHash: sha256(token),
    orderId: order.id,
    maxDownloads: MAX_DOWNLOADS_PER_LINK,
    expiresAt,
  });
  return { token, expiresAt };
}

export type RedeemResult = { ok: true; productId: string } | { ok: false; status: number; message: string };

export async function redeemDownloadToken(token: string): Promise<RedeemResult> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return { ok: false, status: 404, message: "Invalid download link." };
  const tokenHash = sha256(token);
  // Atomically consume one download if the link is still valid.
  const [row] = await db
    .update(downloadTokens)
    .set({ downloads: sql`${downloadTokens.downloads} + 1` })
    .where(
      and(
        eq(downloadTokens.tokenHash, tokenHash),
        sql`${downloadTokens.expiresAt} > now()`,
        sql`${downloadTokens.downloads} < ${downloadTokens.maxDownloads}`,
      ),
    )
    .returning({ orderId: downloadTokens.orderId });
  if (!row) {
    const [existing] = await db.select().from(downloadTokens).where(eq(downloadTokens.tokenHash, tokenHash));
    if (!existing) return { ok: false, status: 404, message: "Invalid download link." };
    return { ok: false, status: 410, message: "This download link has expired or reached its download limit. Request a new link from your order page." };
  }
  const [order] = await db.select().from(orders).where(eq(orders.id, row.orderId));
  if (!order || order.status !== "paid") return { ok: false, status: 403, message: "Order is not paid." };
  return { ok: true, productId: order.productId };
}
