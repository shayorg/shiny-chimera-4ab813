import type { Config, Context } from "@netlify/functions";
import { sendEmail, paymentConfirmedEmail } from "../../lib/email.ts";
import { error, json, orderKey, readJson, serverError } from "../../lib/http.ts";
import { getNetwork } from "../../lib/network.ts";
import { DOWNLOAD_TTL_HOURS, getOrderForKey, issueDownloadToken, publicOrder, verifyOrderPayment } from "../../lib/orders.ts";
import { formatUnits, getProduct } from "../../lib/products.ts";
import { db } from "../../db/index.ts";
import { orders } from "../../db/schema.ts";
import { eq } from "drizzle-orm";

export default async (req: Request, context: Context) => {
  const accessKey = orderKey(req);
  const body = await readJson(req);
  if (!body || typeof body.txHash !== "string") return error(400, "bad_request", "Expected { txHash }.");

  try {
    const order = await getOrderForKey(context.params.id, accessKey);
    if (!order) return error(404, "not_found", "Order not found.");

    const outcome = await verifyOrderPayment(order, body.txHash.trim());
    if (!outcome.ok) {
      return error(outcome.status, outcome.code, outcome.message, { retryable: outcome.retryable });
    }

    let paid = outcome.order;
    let download = null;
    if (outcome.newlyPaid) {
      const origin = new URL(req.url).origin;
      const link = await issueDownloadToken(paid);
      if (link) {
        const product = getProduct(paid.productId)!;
        const downloadUrl = `${origin}/api/download/${link.token}`;
        const mail = paymentConfirmedEmail({
          lang: paid.lang,
          productName: product.name[paid.lang === "fa" ? "fa" : "en"],
          amount: formatUnits(paid.amountUnits),
          txHash: paid.txHash!,
          explorer: getNetwork().explorer,
          downloadUrl,
          orderUrl: `${origin}/checkout/?order=${paid.id}#k=${accessKey}`,
          hours: DOWNLOAD_TTL_HOURS,
        });
        const emailStatus = await sendEmail(paid.email, mail.subject, mail.html);
        [paid] = await db.update(orders).set({ emailStatus }).where(eq(orders.id, paid.id)).returning();
        download = { url: downloadUrl, expiresAt: link.expiresAt.toISOString() };
      }
    }
    return json({ order: publicOrder(paid), download });
  } catch (err) {
    return serverError("order-verify", err);
  }
};

export const config: Config = {
  path: "/api/orders/:id/verify",
  method: "POST",
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
