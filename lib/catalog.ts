import { getStore } from "@netlify/blobs";
import { PRODUCTS, type Product } from "./products.ts";

export const privateFiles = () => getStore("private-products");

// Live checkout requires an explicit switch AND an uploaded private file for the product,
// so customers can never pay for something that can't be delivered.
export const checkoutSwitchOn = () => process.env.CHECKOUT_ENABLED === "true";

export async function isPurchasable(product: Product): Promise<boolean> {
  if (!checkoutSwitchOn()) return false;
  return (await privateFiles().getMetadata(product.id)) !== null;
}

export async function availability() {
  const on = checkoutSwitchOn();
  const store = privateFiles();
  return Promise.all(
    PRODUCTS.map(async (p) => {
      const hasFile = (await store.getMetadata(p.id)) !== null;
      return { product: p, hasFile, purchasable: on && hasFile };
    }),
  );
}
