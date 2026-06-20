// Cloudflare Pages Function — POST /api/verify-payment
// Verifies the Razorpay payment signature: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET).
// Only a matching signature is treated as paid. Uses Web Crypto (no Node SDK needed on Workers runtime).

export async function onRequestPost(context) {
  const { env, request } = context;
  const KEY_SECRET = env.RAZORPAY_KEY_SECRET;
  const headers = { "Content-Type": "application/json" };

  if (!KEY_SECRET) {
    return json({ error: "Server not configured: Razorpay secret missing." }, 500, headers);
  }

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
    // Signature mismatch — do NOT mark as paid.
    return json({ verified: false, error: "Signature verification failed." }, 400, headers);
  }

  // Verified. NOTE (next build phase): trigger Notion course-delivery email + add buyer to Brevo
  // here OR (more robustly) from a Razorpay webhook. Until that's wired, this just confirms payment.
  return json({ verified: true, payment_id: razorpay_payment_id }, 200, headers);
}

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
