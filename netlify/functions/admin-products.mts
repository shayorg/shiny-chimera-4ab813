import type { Config, Context } from "@netlify/functions";
import { availability, privateFiles } from "../../lib/catalog.ts";
import { error, json, serverError } from "../../lib/http.ts";
import { getProduct } from "../../lib/products.ts";
import { safeEqual } from "../../lib/secrets.ts";

// Admin-only: upload and inspect private product files.
//   GET /api/admin/products               -> which products have files and are purchasable
//   PUT /api/admin/products/:id           -> upload file body (headers: x-filename, content-type)
function authorized(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return !!token && token.length >= 32 && safeEqual(given, token);
}

export default async (req: Request, context: Context) => {
  if (!authorized(req)) return error(401, "unauthorized", "Unauthorized.");
  try {
    if (req.method === "GET") {
      const items = await availability();
      return json({ products: items.map((i) => ({ id: i.product.id, hasFile: i.hasFile, purchasable: i.purchasable })) });
    }
    const product = getProduct(context.params.id);
    if (!product) return error(404, "unknown_product", "Unknown product.");
    const data = await req.arrayBuffer();
    if (data.byteLength === 0) return error(400, "empty_file", "Request body is empty.");
    const filename = req.headers.get("x-filename") || `shay-ai-academy-${product.id}`;
    const contentType = req.headers.get("content-type") || "application/octet-stream";
    await privateFiles().set(product.id, data, { metadata: { filename, contentType, uploadedAt: new Date().toISOString() } });
    return json({ id: product.id, bytes: data.byteLength, filename }, 201);
  } catch (err) {
    return serverError("admin-products", err);
  }
};

export const config: Config = {
  path: ["/api/admin/products", "/api/admin/products/:id"],
  method: ["GET", "PUT"],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
