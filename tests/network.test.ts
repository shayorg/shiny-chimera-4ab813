import assert from "node:assert/strict";
import { test } from "node:test";
import { getNetwork } from "../lib/network.ts";
import { formatUnits } from "../lib/products.ts";

test("production is always pinned to Base mainnet native USDC", () => {
  const n = getNetwork({ CONTEXT: "production", PAYMENT_NETWORK: "base-sepolia" });
  assert.equal(n.chainId, 8453);
  assert.equal(n.usdc, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
});

test("testnet can be selected outside production", () => {
  assert.equal(getNetwork({ CONTEXT: "deploy-preview", PAYMENT_NETWORK: "base-sepolia" }).chainId, 84532);
  assert.equal(getNetwork({}).chainId, 8453);
});

test("formats USDC base units", () => {
  assert.equal(formatUnits(5_004_213n), "5.004213");
  assert.equal(formatUnits(19_000_001), "19.000001");
});
