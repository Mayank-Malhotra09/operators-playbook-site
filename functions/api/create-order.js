// Cloudflare Pages Function — POST /api/create-order
// Creates a Razorpay order server-side. The price is set HERE (server-authoritative);
// the client never sends the amount, so it can't be tampered with.
// Secrets come from Cloudflare env vars (Settings → Environment variables), never from code.

const PRICE_PAISE = 99900; // ₹999 launch price. Change here (and only here) when it flips to ₹1,699 → 169900.
const CURRENCY = "INR";

export async function onRequestPost(context) {
  const { env } = context;
  const KEY_ID = env.RAZORPAY_KEY_ID;
  const KEY_SECRET = env.RAZORPAY_KEY_SECRET;
  const headers = { "Content-Type": "application/json" };

  if (!KEY_ID || !KEY_SECRET) {
    return json({ error: "Server not configured: Razorpay keys missing." }, 500, headers);
  }
  if (PRICE_PAISE < 100) {
    return json({ error: "Invalid price configuration." }, 500, headers);
  }

  try {
    const auth = btoa(`${KEY_ID}:${KEY_SECRET}`);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: PRICE_PAISE,
        currency: CURRENCY,
        receipt: "opb_" + Date.now(),
        notes: { product: "Meta Ads Playbook (Beginner)" },
      }),
    });

    if (res.status === 401) {
      return json({ error: "Razorpay authentication failed." }, 401, headers);
    }
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "Razorpay order creation failed.", detail }, 500, headers);
    }

    const order = await res.json();
    // key_id is public and required by the frontend checkout — returning it here
    // means the live/test key is never hardcoded in the HTML and swaps with the env var.
    return json(
      { order_id: order.id, amount: order.amount, currency: order.currency, key_id: KEY_ID },
      200,
      headers
    );
  } catch (e) {
    return json({ error: "Unexpected error creating order.", detail: String(e) }, 500, headers);
  }
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers });
}
