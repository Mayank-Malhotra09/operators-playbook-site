// Shared Razorpay Standard Checkout wiring for all sales-page variants.
// Any element with [data-buy] triggers: create-order → open Razorpay modal → verify-payment.
// The amount + key live server-side; nothing sensitive is in this file.

(function () {
  var SUPPORT_EMAIL = "operators.playbook2020s@gmail.com";

  async function startCheckout(btn) {
    var label = btn ? btn.textContent : "";
    var reset = function () {
      if (btn) {
        btn.textContent = label;
        btn.removeAttribute("data-busy");
      }
    };

    try {
      if (btn) {
        btn.setAttribute("data-busy", "1");
        btn.textContent = "Loading…";
      }

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
        handler: async function (resp) {
          try {
            var v = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(resp),
            });
            var result = await v.json();
            if (v.ok && result.verified) {
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

      rzp.open();
      reset(); // restore the button label now that the modal is up
    } catch (e) {
      alert(e.message || "Something went wrong starting checkout.");
      reset();
    }
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-buy]");
    if (!btn) return;
    e.preventDefault();
    if (btn.getAttribute("data-busy")) return;
    startCheckout(btn);
  });
})();
