// Turns "Request launch notification" buttons into checkout links, but only for
// products the server reports as purchasable (checkout switched on + file uploaded).
(async () => {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    if (!cfg.checkoutEnabled) return;
    for (const p of cfg.products) {
      const btn = document.querySelector(`[data-product="${p.id}"]`);
      if (!btn || !p.purchasable) continue;
      btn.classList.remove('ghost');
      btn.dataset.en = `Buy for ${p.price.replace(/\.0+$/, '')} USDC`;
      btn.dataset.fa = `خرید با ${p.price.replace(/\.0+$/, '')} USDC`;
      btn.textContent = document.body.dir === 'rtl' ? btn.dataset.fa : btn.dataset.en;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        location.href = `/checkout/?product=${p.id}&lang=${document.documentElement.lang || 'en'}`;
      });
    }
    const note = document.querySelector('.note');
    if (note) {
      note.dataset.en = 'Checkout is open for products with a Buy button. Pay only on the checkout page, only on the Base network, and send the exact USDC amount shown for your order. Never send funds based on messages from anyone else.';
      note.dataset.fa = 'خرید برای محصولاتی که دکمه «خرید» دارند فعال است. فقط از صفحه پرداخت، فقط روی شبکه Base و دقیقاً همان مبلغ USDC سفارش خود را بفرستید. هرگز بر اساس پیام دیگران پول نفرستید.';
      note.textContent = document.body.dir === 'rtl' ? note.dataset.fa : note.dataset.en;
    }
  } catch {}
})();
