import type { Config } from "@netlify/functions";
import { isPurchasable } from "../../lib/catalog.ts";
import { error, json, readJson, serverError } from "../../lib/http.ts";
import { createOrder, publicOrder } from "../../lib/orders.ts";
import { getProduct } from "../../lib/products.ts";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export default async (req: Request) => {
  const body = await readJson(req);
  if (!body) return error(400, "bad_request", "Expected a JSON body.");
  const product = getProduct(body.productId);
  if (!product) return error(400, "unknown_product", "Unknown product.");
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) return error(400, "invalid_email", "Please enter a valid email address.");
  const lang = body.lang === "fa" ? "fa" : "en";

  try {
    if (!(await isPurchasable(product))) {
      return error(403, "checkout_unavailable", "Checkout for this product is not open yet.");
    }
    const { order, accessKey } = await createOrder(product, email, lang);
    return json({ order: publicOrder(order), accessKey }, 201);
  } catch (err) {
    return serverError("orders-create", err);
  }
};

export const config: Config = {
  path: "/api/orders",
  method: "POST",
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
