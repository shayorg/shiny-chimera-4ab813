// Transactional email via Resend's HTTP API. Requires RESEND_API_KEY and EMAIL_FROM;
// when they're missing, emails are skipped and the order records "not_configured".

export type EmailStatus = "sent" | "failed" | "not_configured";

export async function sendEmail(to: string, subject: string, html: string): Promise<EmailStatus> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return "not_configured";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, reply_to: "mr.naab021@gmail.com" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("Email send failed", res.status);
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("Email send error", err);
    return "failed";
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function paymentConfirmedEmail(o: {
  lang: string;
  productName: string;
  amount: string;
  txHash: string;
  explorer: string;
  downloadUrl: string;
  orderUrl: string;
  hours: number;
}) {
  const fa = o.lang === "fa";
  const subject = fa ? `پرداخت تأیید شد: ${o.productName}` : `Payment confirmed: ${o.productName}`;
  const body = fa
    ? `<div dir="rtl" style="font-family:Tahoma,sans-serif"><h2>از خرید شما متشکریم</h2>
<p>پرداخت ${esc(o.amount)} USDC برای «${esc(o.productName)}» روی شبکه Base تأیید شد.</p>
<p><a href="${esc(o.downloadUrl)}">دانلود فایل</a> (این لینک ${o.hours} ساعت معتبر است)</p>
<p>برای دریافت لینک جدید، <a href="${esc(o.orderUrl)}">صفحه سفارش</a> را باز کنید.</p>
<p>تراکنش: <a href="${esc(o.explorer)}/tx/${esc(o.txHash)}">${esc(o.txHash)}</a></p>
<p>سؤال؟ به همین ایمیل پاسخ دهید یا در تلگرام @hsyorg پیام دهید.</p></div>`
    : `<div style="font-family:system-ui,sans-serif"><h2>Thanks for your purchase</h2>
<p>Your payment of ${esc(o.amount)} USDC for “${esc(o.productName)}” was confirmed on Base.</p>
<p><a href="${esc(o.downloadUrl)}">Download your file</a> (link valid for ${o.hours} hours)</p>
<p>Need a fresh link later? Open your <a href="${esc(o.orderUrl)}">order page</a>.</p>
<p>Transaction: <a href="${esc(o.explorer)}/tx/${esc(o.txHash)}">${esc(o.txHash)}</a></p>
<p>Questions? Reply to this email or message @hsyorg on Telegram.</p></div>`;
  return { subject, html: body };
}
