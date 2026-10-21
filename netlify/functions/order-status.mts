import type { Config, Context } from "@netlify/functions";
import { error, json, orderKey, serverError } from "../../lib/http.ts";
import { getOrderForKey, publicOrder } from "../../lib/orders.ts";

export default async (req: Request, context: Context) => {
  try {
    const order = await getOrderForKey(context.params.id, orderKey(req));
    if (!order) return error(404, "not_found", "Order not found.");
    return json({ order: publicOrder(order) });
  } catch (err) {
    return serverError("order-status", err);
  }
};

export const config: Config = {
  path: "/api/orders/:id",
  method: "GET",
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
