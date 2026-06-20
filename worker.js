// Cloudflare Worker (Static Assets model).
// - Serves the static sales pages from /public via the ASSETS binding.
// - Handles the Razorpay payment API routes itself.
// Secrets come from the Worker's env vars (dashboard → Variables and secrets), never from code.

const PRICE_PAISE = 99900; // ₹999 launch price — server-authoritative. Flip to 169900 for ₹1,699.
const CURRENCY = "INR";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create-order" && request.method === "POST") {
      return createOrder(env);
    }
    if (url.pathname === "/api/verify-payment" && request.method === "POST") {
      return verifyPayment(request, env);
    }

    // Everything else: serve the static site.
    return env.ASSETS.fetch(request);
  },
};

// ---------- POST /api/create-order ----------
async function createOrder(env) {
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

    if (res.status === 401) return json({ error: "Razorpay authentication failed." }, 401, headers);
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "Razorpay order creation failed.", detail }, 500, headers);
    }

    const order = await res.json();
    // key_id is public and required by the frontend — returning it here means the
    // live/test key is never hardcoded in HTML and swaps automatically with the env var.
    return json(
      { order_id: order.id, amount: order.amount, currency: order.currency, key_id: KEY_ID },
      200,
      headers
    );
  } catch (e) {
    return json({ error: "Unexpected error creating order.", detail: String(e) }, 500, headers);
  }
}

// ---------- POST /api/verify-payment ----------
async function verifyPayment(request, env) {
  const KEY_SECRET = env.RAZORPAY_KEY_SECRET;
  const headers = { "Content-Type": "application/json" };

  if (!KEY_SECRET) return json({ error: "Server not configured: Razorpay secret missing." }, 500, headers);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400, headers);
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = data || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return json({ verified: false, error: "Missing required fields." }, 400, headers);
  }

  const expected = await hmacSha256Hex(KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (!timingSafeEqual(expected, razorpay_signature)) {
    return json({ verified: false, error: "Signature verification failed." }, 400, headers);
  }

  // Verified. NEXT PHASE: trigger Notion delivery email + add buyer to Brevo here (or via webhook).
  return json({ verified: true, payment_id: razorpay_payment_id }, 200, headers);
}

// ---------- helpers ----------
async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers });
}
