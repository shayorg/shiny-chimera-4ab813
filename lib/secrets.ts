import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const newSecret = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const randomSuffix = () => randomInt(1, 10_000); // 0.000001 – 0.009999 USDC

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
