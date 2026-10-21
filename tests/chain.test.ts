import assert from "node:assert/strict";
import { test } from "node:test";
import { TRANSFER_TOPIC, verifyUsdcPayment, type Expected, type Rpc } from "../lib/chain.ts";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const RECIPIENT = "0x7E308f09EAAC6129685f6009F0CF84643B40CFED";
const PAYER = "0x1111111111111111111111111111111111111111";
const HASH = "0x" + "ab".repeat(32);
const pad = (addr: string) => "0x" + addr.slice(2).toLowerCase().padStart(64, "0");
const hex = (n: number | bigint) => "0x" + BigInt(n).toString(16);

const now = Date.now();
const expected: Expected = {
  chainId: 8453,
  usdc: USDC,
  recipient: RECIPIENT,
  amountUnits: 5_004_213n,
  notBefore: new Date(now - 10 * 60_000),
  notAfter: new Date(now + 50 * 60_000),
  minConfirmations: 5,
};

type Chain = { chainId?: number; head?: number; receipt?: any; blockTs?: number };

function transferLog(over: Partial<{ address: string; to: string; value: bigint; topics: string[]; removed: boolean }> = {}) {
  return {
    address: over.address ?? USDC.toLowerCase(),
    topics: over.topics ?? [TRANSFER_TOPIC, pad(PAYER), pad(over.to ?? RECIPIENT)],
    data: "0x" + (over.value ?? 5_004_213n).toString(16).padStart(64, "0"),
    logIndex: "0x3",
    removed: over.removed ?? false,
  };
}

function mockRpc(c: Chain = {}): Rpc {
  const receipt = c.receipt === undefined ? { status: "0x1", blockNumber: hex(100), logs: [transferLog()] } : c.receipt;
  return async (method) => {
    switch (method) {
      case "eth_chainId": return hex(c.chainId ?? 8453);
      case "eth_getTransactionReceipt": return receipt;
      case "eth_blockNumber": return hex(c.head ?? 110);
      case "eth_getBlockByNumber": return { timestamp: hex(Math.floor((c.blockTs ?? now) / 1000)) };
      default: throw new Error("unexpected " + method);
    }
  };
}

test("accepts an exact native USDC transfer to the store wallet", async () => {
  const r = await verifyUsdcPayment(mockRpc(), HASH, expected);
  assert.deepEqual(r, { ok: true, payer: PAYER, blockNumber: 100, logIndex: 3 });
});

test("rejects malformed hashes without calling the RPC", async () => {
  const r = await verifyUsdcPayment(async () => { throw new Error("called"); }, "0x123", expected);
  assert.equal(r.ok || r.code, "invalid_hash");
});

test("rejects wrong network", async () => {
  const r = await verifyUsdcPayment(mockRpc({ chainId: 1 }), HASH, expected);
  assert.equal(r.ok || r.code, "wrong_network");
});

test("reports not-yet-indexed transactions as retryable", async () => {
  const r = await verifyUsdcPayment(mockRpc({ receipt: null }), HASH, expected);
  assert.ok(!r.ok && r.code === "not_found" && r.retryable);
});

test("rejects reverted transactions", async () => {
  const r = await verifyUsdcPayment(mockRpc({ receipt: { status: "0x0", blockNumber: hex(100), logs: [transferLog()] } }), HASH, expected);
  assert.equal(r.ok || r.code, "tx_failed");
});

test("rejects a look-alike token contract", async () => {
  const fake = transferLog({ address: "0x9999999999999999999999999999999999999999" });
  const r = await verifyUsdcPayment(mockRpc({ receipt: { status: "0x1", blockNumber: hex(100), logs: [fake] } }), HASH, expected);
  assert.equal(r.ok || r.code, "no_matching_transfer");
});

test("rejects transfers to a different recipient", async () => {
  const other = transferLog({ to: "0x2222222222222222222222222222222222222222" });
  const r = await verifyUsdcPayment(mockRpc({ receipt: { status: "0x1", blockNumber: hex(100), logs: [other] } }), HASH, expected);
  assert.equal(r.ok || r.code, "no_matching_transfer");
});

test("rejects removed (reorged) logs", async () => {
  const r = await verifyUsdcPayment(mockRpc({ receipt: { status: "0x1", blockNumber: hex(100), logs: [transferLog({ removed: true })] } }), HASH, expected);
  assert.equal(r.ok || r.code, "no_matching_transfer");
});

test("rejects underpayment, overpayment and the bare list price", async () => {
  for (const value of [5_004_212n, 5_004_214n, 5_000_000n]) {
    const r = await verifyUsdcPayment(mockRpc({ receipt: { status: "0x1", blockNumber: hex(100), logs: [transferLog({ value })] } }), HASH, expected);
    assert.equal(r.ok || r.code, "amount_mismatch", `value ${value}`);
  }
});

test("finds the matching transfer among several logs", async () => {
  const logs = [transferLog({ value: 1n }), { ...transferLog(), logIndex: "0x7" }];
  const r = await verifyUsdcPayment(mockRpc({ receipt: { status: "0x1", blockNumber: hex(100), logs } }), HASH, expected);
  assert.ok(r.ok && r.logIndex === 7);
});

test("waits for enough confirmations", async () => {
  const r = await verifyUsdcPayment(mockRpc({ head: 102 }), HASH, expected);
  assert.ok(!r.ok && r.code === "unconfirmed" && r.retryable);
});

test("rejects transactions sent before the order existed", async () => {
  const r = await verifyUsdcPayment(mockRpc({ blockTs: now - 2 * 3600_000 }), HASH, expected);
  assert.equal(r.ok || r.code, "outside_window");
});

test("rejects transactions sent after the order expired", async () => {
  const r = await verifyUsdcPayment(mockRpc({ blockTs: now + 2 * 3600_000 }), HASH, expected);
  assert.equal(r.ok || r.code, "outside_window");
});

test("surfaces RPC outages as retryable", async () => {
  const r = await verifyUsdcPayment(async () => { throw new Error("down"); }, HASH, expected);
  assert.ok(!r.ok && r.code === "rpc_error" && r.retryable);
});
