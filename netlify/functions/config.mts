import type { Config } from "@netlify/functions";
import { availability, checkoutSwitchOn } from "../../lib/catalog.ts";
import { json, serverError } from "../../lib/http.ts";
import { getNetwork, RECIPIENT } from "../../lib/network.ts";
import { formatUnits } from "../../lib/products.ts";

export default async () => {
  try {
    const network = getNetwork();
    const items = await availability();
    return json({
      checkoutEnabled: checkoutSwitchOn() && items.some((i) => i.purchasable),
      network: { name: network.name, chainId: network.chainId, usdc: network.usdc, explorer: network.explorer },
      recipient: RECIPIENT,
      products: items.map(({ product, purchasable }) => ({
        id: product.id,
        name: product.name,
        price: formatUnits(product.priceUnits),
        purchasable,
      })),
    });
  } catch (err) {
    return serverError("config", err);
  }
};

export const config: Config = { path: "/api/config", method: "GET" };
