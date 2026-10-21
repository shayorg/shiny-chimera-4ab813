import type { Config, Context } from "@netlify/functions";
import { error, json, orderKey, serverError } from "../../lib/http.ts";
import { getOrderForKey, issueDownloadToken } from "../../lib/orders.ts";

// Issues a fresh expiring download link for a paid order (requires the order access key).
export default async (req: Request, context: Context) => {
  try {
    const order = await getOrderForKey(context.params.id, orderKey(req));
    if (!order) return error(404, "not_found", "Order not found.");
    if (order.status !== "paid") return error(402, "not_paid", "This order has not been paid yet.");
    const link = await issueDownloadToken(order);
    if (!link) return error(429, "link_limit", "Download link limit reached for this order. Please contact support.");
    const url = `${new URL(req.url).origin}/api/download/${link.token}`;
    return json({ download: { url, expiresAt: link.expiresAt.toISOString() } }, 201);
  } catch (err) {
    return serverError("order-link", err);
  }
};

export const config: Config = {
  path: "/api/orders/:id/download-link",
  method: "POST",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
