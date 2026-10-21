// Payment network configuration. Production is always pinned to Base mainnet with
// native (Circle-issued) USDC; the Base Sepolia testnet can only be selected outside production.

export type Network = {
  key: "base" | "base-sepolia";
  name: string;
  chainId: number;
  usdc: string;
  rpcUrl: string;
  explorer: string;
  minConfirmations: number;
};

export const RECIPIENT = "0x7E308f09EAAC6129685f6009F0CF84643B40CFED";

const NETWORKS = {
  base: {
    key: "base",
    name: "Base",
    chainId: 8453,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    rpcUrl: "https://mainnet.base.org",
    explorer: "https://basescan.org",
  },
  "base-sepolia": {
    key: "base-sepolia",
    name: "Base Sepolia (testnet)",
    chainId: 84532,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    rpcUrl: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
  },
} as const;

export function getNetwork(env: Record<string, string | undefined> = process.env): Network {
  const isProduction = env.CONTEXT === "production";
  const key = !isProduction && env.PAYMENT_NETWORK === "base-sepolia" ? "base-sepolia" : "base";
  const base = NETWORKS[key];
  return {
    ...base,
    rpcUrl: env.BASE_RPC_URL || base.rpcUrl,
    minConfirmations: Math.max(1, Number(env.MIN_CONFIRMATIONS) || 5),
  };
}
