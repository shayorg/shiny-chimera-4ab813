// Mock Base JSON-RPC node for end-to-end tests (no real funds involved).
// POST /__tx {hash, to, value, token?, status?, blockTsOffsetMs?} registers a fake transfer.
import { createServer } from "node:http";

const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (h) => "0x" + h.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const txs = new Map();
let head = 1000;

createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  res.setHeader("content-type", "application/json");
  if (req.url === "/__tx") {
    const block = ++head;
    txs.set(body.hash.toLowerCase(), {
      status: body.status ?? "0x1",
      blockNumber: "0x" + block.toString(16),
      ts: Math.floor((Date.now() + (body.blockTsOffsetMs ?? 0)) / 1000),
      logs: [{
        address: body.token ?? USDC,
        topics: [TOPIC, pad("0x1111111111111111111111111111111111111111"), pad(body.to)],
        data: pad(BigInt(body.value).toString(16)),
        logIndex: "0x0",
        removed: false,
      }],
    });
    head += 10; // enough confirmations
    return res.end("{}");
  }
  const result = (() => {
    switch (body.method) {
      case "eth_chainId": return "0x2105";
      case "eth_blockNumber": return "0x" + head.toString(16);
      case "eth_getTransactionReceipt": return txs.get(body.params[0].toLowerCase()) ?? null;
      case "eth_getBlockByNumber": {
        const tx = [...txs.values()].find((t) => t.blockNumber === body.params[0]);
        return tx ? { timestamp: "0x" + tx.ts.toString(16) } : null;
      }
    }
  })();
  res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
}).listen(8545, () => console.log("mock rpc on 8545"));
