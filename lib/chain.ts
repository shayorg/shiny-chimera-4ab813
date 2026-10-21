// On-chain verification of a USDC payment for a specific order.
// Pure logic over a JSON-RPC function so it can be tested without real funds.

export type Rpc = (method: string, params: unknown[]) => Promise<any>;

export type Expected = {
  chainId: number;
  usdc: string;
  recipient: string;
  amountUnits: bigint;
  notBefore: Date; // order creation time
  notAfter: Date; // order expiry time
  minConfirmations: number;
};

export type VerifyResult =
  | { ok: true; payer: string; blockNumber: number; logIndex: number }
  | { ok: false; code: VerifyErrorCode; retryable: boolean; message: string };

export type VerifyErrorCode =
  | "invalid_hash"
  | "wrong_network"
  | "not_found"
  | "tx_failed"
  | "no_matching_transfer"
  | "amount_mismatch"
  | "unconfirmed"
  | "outside_window"
  | "rpc_error";

export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
// Allow for small clock differences between our server and block timestamps.
const CLOCK_SKEW_MS = 60_000;

export function isTxHash(v: unknown): v is string {
  return typeof v === "string" && TX_HASH_RE.test(v);
}

export function createRpc(url: string, fetchImpl: typeof fetch = fetch): Rpc {
  let id = 0;
  return async (method, params) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`RPC error: ${body.error.message ?? "unknown"}`);
    return body.result;
  };
}

const fail = (code: VerifyErrorCode, message: string, retryable = false): VerifyResult => ({
  ok: false,
  code,
  retryable,
  message,
});

function topicToAddress(topic: string): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

export async function verifyUsdcPayment(rpc: Rpc, txHash: string, exp: Expected): Promise<VerifyResult> {
  if (!isTxHash(txHash)) return fail("invalid_hash", "Transaction hash must be 0x followed by 64 hex characters.");

  try {
    const chainId = Number(BigInt(await rpc("eth_chainId", [])));
    if (chainId !== exp.chainId) return fail("wrong_network", `Payment node is on chain ${chainId}, expected ${exp.chainId}.`);

    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (!receipt) return fail("not_found", "Transaction not found on Base yet. Wait a moment and try again.", true);
    if (receipt.status !== "0x1") return fail("tx_failed", "This transaction failed on-chain.");

    const usdc = exp.usdc.toLowerCase();
    const recipient = exp.recipient.toLowerCase();
    const transfers = (receipt.logs ?? []).filter(
      (l: any) =>
        !l.removed &&
        String(l.address).toLowerCase() === usdc &&
        l.topics?.length === 3 &&
        String(l.topics[0]).toLowerCase() === TRANSFER_TOPIC &&
        topicToAddress(l.topics[2]) === recipient,
    );
    if (transfers.length === 0) {
      return fail("no_matching_transfer", "No native USDC transfer to the store wallet was found in this transaction.");
    }

    const match = transfers.find((l: any) => BigInt(l.data) === exp.amountUnits);
    if (!match) {
      return fail(
        "amount_mismatch",
        "The USDC amount sent does not exactly match this order. Please contact support with your transaction hash.",
      );
    }

    const blockNumber = Number(BigInt(receipt.blockNumber));
    const head = Number(BigInt(await rpc("eth_blockNumber", [])));
    const confirmations = head - blockNumber + 1;
    if (confirmations < exp.minConfirmations) {
      return fail("unconfirmed", `Waiting for confirmations (${Math.max(confirmations, 0)}/${exp.minConfirmations}).`, true);
    }

    const block = await rpc("eth_getBlockByNumber", [receipt.blockNumber, false]);
    if (!block) return fail("rpc_error", "Could not load the transaction's block.", true);
    const ts = Number(BigInt(block.timestamp)) * 1000;
    if (ts < exp.notBefore.getTime() - CLOCK_SKEW_MS || ts > exp.notAfter.getTime() + CLOCK_SKEW_MS) {
      return fail("outside_window", "This transaction was not sent during this order's payment window.");
    }

    return {
      ok: true,
      payer: topicToAddress(match.topics[1]),
      blockNumber,
      logIndex: Number(BigInt(match.logIndex)),
    };
  } catch (err) {
    return fail("rpc_error", "Could not reach the Base network to verify payment. Please retry shortly.", true);
  }
}
