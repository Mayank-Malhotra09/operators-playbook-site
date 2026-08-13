// Shared Razorpay Standard Checkout wiring for all sales-page variants.
// Any element with [data-buy] opens an email-capture step, then:
//   create-order → Razorpay modal → verify-payment → /thank-you
//
// WHY THE EMAIL STEP: Razorpay's mobile flow can complete on phone number alone and
// then reports the payment email as "void@razorpay.com". Delivery is an emailed Notion
// link, so a purchase without a real email is an undeliverable sale. We collect it
// ourselves, show it to the buyer, and pass it in `notes` — the webhook treats that as
// authoritative. Bonus: we keep the address even if they abandon at the payment modal.
//
// The amount + key live server-side; nothing sensitive is in this file.

(function () {
  var SUPPORT_EMAIL = "operators.playbook2020s@gmail.com";
  var modal, pendingBtn;

  function buildModal() {
    var css = document.createElement("style");
    css.textContent =
      ".opb-buy-ov{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(10,10,8,.72);backdrop-filter:blur(4px);padding:20px}" +
      ".opb-buy-ov.on{display:flex}" +
      ".opb-buy{background:#1B1A16;border:1px solid #2C2A24;border-radius:16px;max-width:420px;width:100%;padding:30px 28px;font-family:Inter,system-ui,sans-serif;color:#ECEAE3;box-shadow:0 30px 80px rgba(0,0,0,.5)}" +
      ".opb-buy h3{font-family:Newsreader,Georgia,serif;font-weight:600;font-size:1.5rem;margin:0 0 8px}" +
      ".opb-buy p{color:#8E8A7F;font-size:.95rem;margin:0 0 18px;line-height:1.5}" +
      ".opb-buy input{width:100%;padding:13px 14px;margin-bottom:12px;background:#121210;border:1px solid #2C2A24;border-radius:8px;color:#ECEAE3;font-size:1rem;font-family:inherit;box-sizing:border-box}" +
      ".opb-buy input:focus{outline:2px solid #E8893A;border-color:#E8893A}" +
      ".opb-buy button.go{width:100%;padding:14px;background:#E8893A;color:#1a1206;border:none;border-radius:8px;font-weight:600;font-size:1rem;cursor:pointer;font-family:inherit}" +
      ".opb-buy button.go:hover{background:#F29A4D}" +
      ".opb-buy button.go[disabled]{opacity:.6;cursor:default}" +
      ".opb-buy .x{float:right;cursor:pointer;color:#8E8A7F;font-size:1.4rem;line-height:1;background:none;border:none;padding:0;width:auto}" +
      ".opb-buy .err{color:#E5604E;font-size:.85rem;margin:-4px 0 10px;min-height:1em}" +
      ".opb-buy .fine{color:#8E8A7F;font-size:.78rem;margin-top:12px;text-align:center}";
    document.head.appendChild(css);

    modal = document.createElement("div");
    modal.className = "opb-buy-ov";
    modal.innerHTML =
      '<div class="opb-buy" role="dialog" aria-modal="true" aria-label="Complete your purchase">' +
      '<button class="x" aria-label="Close">&times;</button>' +
      "<h3>Where should we send it?</h3>" +
      "<p>Your Notion access link goes to this address the moment payment clears. Double-check it &mdash; it's the only copy.</p>" +
      '<input type="text" id="opb-buy-name" placeholder="First name" autocomplete="given-name" required>' +
      '<input type="email" id="opb-buy-email" placeholder="you@email.com" autocomplete="email" inputmode="email" required>' +
      '<div class="err" id="opb-buy-err"></div>' +
      '<button class="go" id="opb-buy-go">Continue to payment &rarr;</button>' +
      '<div class="fine">Secure payment via Razorpay</div>' +
      "</div>";
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.classList.contains("x")) closeModal();
    });
    modal.querySelector("#opb-buy-go").addEventListener("click", submitModal);
    modal.querySelector("#opb-buy-name").addEventListener("keydown", function (e) {
      if (e.key === "Enter") modal.querySelector("#opb-buy-email").focus();
    });
    modal.querySelector("#opb-buy-email").addEventListener("keydown", function (e) {
      if (e.key === "Enter") submitModal();
    });
  }

  function openModal(btn) {
    if (!modal) buildModal();
    pendingBtn = btn;
    modal.querySelector("#opb-buy-err").textContent = "";
    resetGo();

    // Someone who took the free chapter already gave us these — don't ask twice.
    try {
      var e = localStorage.getItem("opb_email") || "";
      var n = localStorage.getItem("opb_name") || "";
      if (e) modal.querySelector("#opb-buy-email").value = e;
      if (n) modal.querySelector("#opb-buy-name").value = n;
    } catch (err) {}

    modal.classList.add("on");
    setTimeout(function () {
      var el = modal.querySelector(modal.querySelector("#opb-buy-name").value ? "#opb-buy-email" : "#opb-buy-name");
      if (el) el.focus();
    }, 50);
  }

  function closeModal() {
    if (modal) modal.classList.remove("on");
  }

  function resetGo() {
    var go = modal.querySelector("#opb-buy-go");
    go.textContent = "Continue to payment →";
    go.disabled = false;
  }

  function submitModal() {
    var nameEl = modal.querySelector("#opb-buy-name");
    var emailEl = modal.querySelector("#opb-buy-email");
    var errEl = modal.querySelector("#opb-buy-err");
    var name = (nameEl.value || "").trim();
    var email = (emailEl.value || "").trim();

    if (name.length < 2) {
      errEl.textContent = "Please enter your first name.";
      nameEl.focus();
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errEl.textContent = "Please enter a valid email — this is where the playbook goes.";
      emailEl.focus();
      return;
    }
    errEl.textContent = "";

    try {
      localStorage.setItem("opb_email", email);
      localStorage.setItem("opb_name", name);
    } catch (e) {}

    var go = modal.querySelector("#opb-buy-go");
    go.textContent = "Loading…";
    go.disabled = true;
    startCheckout(name, email);
  }

  async function startCheckout(name, email) {
    var btn = pendingBtn;
    var label = btn ? btn.textContent : "";
    var reset = function () {
      if (btn) {
        btn.textContent = label;
        btn.removeAttribute("data-busy");
      }
      if (modal) resetGo();
    };

    try {
      var orderRes = await fetch("/api/create-order", { method: "POST" });
      var order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error || "Couldn't start checkout. Please try again.");
      if (!window.Razorpay) throw new Error("Payment library didn't load. Check your connection and retry.");

      var rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "Operator's Playbook",
        description: "Meta Ads Playbook (Beginner)",
        theme: { color: "#E8893A" },
        prefill: { name: name, email: email },
        // Authoritative for delivery — the webhook reads notes.email first, because
        // Razorpay may report void@razorpay.com when it collects phone only.
        notes: { name: name, email: email, product: "Meta Ads Playbook (Beginner)" },
        handler: async function (resp) {
          try {
            var v = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(resp),
            });
            var result = await v.json();
            if (v.ok && result.verified) {
              // Hand the verified payment to thank-you.html so Purchase fires exactly
              // once, with the payment id as its event id (survives a refresh, and
              // lets a future CAPI send dedupe against this browser event).
              try {
                sessionStorage.setItem("opb_purchase_id", resp.razorpay_payment_id || "");
                sessionStorage.setItem("opb_purchase_amt", String((order.amount || 0) / 100));
                sessionStorage.setItem("opb_purchase_email", email);
              } catch (e) {}
              window.location.href = "/thank-you.html";
            } else {
              alert(
                "We couldn't verify your payment. If you were charged, email " +
                  SUPPORT_EMAIL +
                  " with this payment id: " +
                  (resp.razorpay_payment_id || "(unknown)")
              );
            }
          } catch (e) {
            alert(
              "Verification error. If you were charged, email " +
                SUPPORT_EMAIL +
                " with this payment id: " +
                (resp.razorpay_payment_id || "(unknown)")
            );
          }
        },
        modal: {
          ondismiss: function () {
            reset();
          },
        },
      });

      rzp.on("payment.failed", function (r) {
        var desc = r && r.error && r.error.description ? r.error.description : "Please try again.";
        alert("Payment failed: " + desc);
      });

      // Meta: fires as the payment modal opens — the top of the buying step.
      if (window.opbTrack)
        window.opbTrack("InitiateCheckout", {
          value: (order.amount || 0) / 100,
          currency: order.currency || "INR",
          content_name: "Meta Ads Playbook (Beginner)",
        });

      closeModal();
      rzp.open();
      reset(); // restore the button label now that the modal is up
    } catch (e) {
      var errEl = modal && modal.querySelector("#opb-buy-err");
      if (errEl) errEl.textContent = e.message || "Something went wrong starting checkout.";
      else alert(e.message || "Something went wrong starting checkout.");
      reset();
    }
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-buy]");
    if (!btn) return;
    e.preventDefault();
    if (btn.getAttribute("data-busy")) return;
    openModal(btn);
  });
})();
