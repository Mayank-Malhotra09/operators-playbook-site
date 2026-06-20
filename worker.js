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
    if (url.pathname === "/api/razorpay-webhook" && request.method === "POST") {
      return handleWebhook(request, env);
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

    if (res.status === 401) {
      // TEMP diagnostic: key_id is public; we expose only the secret's LENGTH, never its value.
      return json(
        {
          error: "Razorpay authentication failed.",
          key_id_used: KEY_ID,
          key_id_length: KEY_ID.length,
          secret_length: KEY_SECRET.length,
        },
        401,
        headers
      );
    }
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

// ---------- POST /api/razorpay-webhook ----------
// Razorpay calls this server-to-server on payment events. This is the AUTHORITATIVE
// trigger for delivery (fires even if the buyer closes the tab). It:
//   1. verifies the webhook signature (HMAC-SHA256 of the raw body w/ the webhook secret)
//   2. on payment.captured, adds the buyer to Brevo + sends the delivery email.
async function handleWebhook(request, env) {
  const WEBHOOK_SECRET = env.RAZORPAY_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) return new Response("Webhook secret not configured", { status: 500 });

  const raw = await request.text(); // must verify against the RAW body
  const headerSig = request.headers.get("x-razorpay-signature") || "";
  const expected = await hmacSha256Hex(WEBHOOK_SECRET, raw);
  if (!timingSafeEqual(expected, headerSig)) {
    return new Response("Invalid signature", { status: 400 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Only fulfil on a successful payment.
  if (body.event !== "payment.captured" && body.event !== "order.paid") {
    return new Response("Ignored event", { status: 200 });
  }

  const payment = body && body.payload && body.payload.payment && body.payload.payment.entity;
  if (!payment || !payment.email) {
    return new Response("No payment email; nothing to deliver", { status: 200 });
  }

  const email = payment.email;
  const paymentId = payment.id;
  const name = (payment.notes && payment.notes.name) || "";

  // Idempotency (optional): if a KV namespace named PROCESSED is bound, skip duplicates.
  if (env.PROCESSED) {
    if (await env.PROCESSED.get(paymentId)) return new Response("Already processed", { status: 200 });
  }

  try {
    await brevoUpsertContact(env, email, name);
    await brevoSendDeliveryEmail(env, email, name);
  } catch (e) {
    // Non-2xx makes Razorpay retry the webhook, so a transient failure self-heals.
    return new Response("Delivery failed: " + String(e), { status: 500 });
  }

  if (env.PROCESSED) {
    await env.PROCESSED.put(paymentId, "1", { expirationTtl: 60 * 60 * 24 * 30 });
  }
  return new Response("OK", { status: 200 });
}

// Add/update the buyer in Brevo and (optionally) drop them in the buyers list.
async function brevoUpsertContact(env, email, name) {
  if (!env.BREVO_API) throw new Error("BREVO_API not set");
  const payload = { email, updateEnabled: true };
  if (name) payload.attributes = { FIRSTNAME: name };
  if (env.BREVO_BUYER_LIST_ID) payload.listIds = [parseInt(env.BREVO_BUYER_LIST_ID, 10)];

  const r = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { "api-key": env.BREVO_API, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  // 201 created / 204 updated = fine. Ignore "already exists" races.
  if (!r.ok && r.status !== 204) {
    const t = await r.text();
    if (!t.includes("duplicate_parameter")) throw new Error("Brevo contact error: " + t);
  }
}

// Send the product-delivery email (the Notion course link) via Brevo transactional API.
async function brevoSendDeliveryEmail(env, email, name) {
  if (!env.BREVO_API) throw new Error("BREVO_API not set");
  const courseUrl = env.NOTION_COURSE_URL;
  if (!courseUrl) throw new Error("NOTION_COURSE_URL not set");

  const senderEmail = env.SENDER_EMAIL || "operators.playbook2020s@gmail.com";
  const senderName = env.SENDER_NAME || "Operator's Playbook";
  const hi = name ? `Hi ${name},` : "Hi,";

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;max-width:560px">` +
    `<p>${hi}</p>` +
    `<p>Thanks for picking up the <strong>Meta Ads Playbook (Beginner)</strong>. Here's your copy:</p>` +
    `<p style="margin:26px 0">` +
    `<a href="${courseUrl}" style="background:#E8893A;color:#1a1206;text-decoration:none;font-weight:bold;padding:13px 24px;border-radius:8px;display:inline-block">Open the playbook in Notion →</a>` +
    `</p>` +
    `<p>Click <strong>Duplicate</strong> (top-right in Notion) and it's yours to keep, edit, and mark up. Start with Chapter 0, then actually do the task at the end of each chapter inside your own ad account — that's the whole point of a read-and-do playbook.</p>` +
    `<p>Trouble opening it? Just reply to this email, or write to <a href="mailto:operators.playbook2020s@gmail.com">operators.playbook2020s@gmail.com</a>.</p>` +
    `<p>— Mayank<br>Operator's Playbook</p>` +
    `</div>`;

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email, name: name || email }],
      subject: "Your Meta Ads Playbook (Beginner) — access inside",
      htmlContent: html,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error("Brevo email error: " + t);
  }
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
