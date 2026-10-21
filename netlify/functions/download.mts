import type { Config, Context } from "@netlify/functions";
import { privateFiles } from "../../lib/catalog.ts";
import { error, serverError } from "../../lib/http.ts";
import { redeemDownloadToken } from "../../lib/orders.ts";

export default async (_req: Request, context: Context) => {
  try {
    const result = await redeemDownloadToken(context.params.token);
    if (!result.ok) return error(result.status, "download_unavailable", result.message);

    const file = await privateFiles().getWithMetadata(result.productId, { type: "stream" });
    if (!file) {
      console.error(`[download] missing private file for ${result.productId}`);
      return error(503, "file_missing", "Your file is temporarily unavailable. Please contact support; your purchase is safe.");
    }
    const meta = file.metadata as Record<string, string>;
    const filename = (meta.filename || `shay-ai-academy-${result.productId}`).replace(/[^\w.\-]/g, "_");
    return new Response(file.data as ReadableStream, {
      headers: {
        "content-type": meta.contentType || "application/octet-stream",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex",
      },
    });
  } catch (err) {
    return serverError("download", err);
  }
};

export const config: Config = {
  path: "/api/download/:token",
  method: "GET",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
