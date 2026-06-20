// Free Chapter 1 lead magnet. Any [data-lead] element opens an email-capture modal,
// POSTs to /api/lead (adds the contact to Brevo → triggers the nurture sequence),
// then opens Chapter 1 immediately. No sensitive values here.

(function () {
  // Public Chapter 1 link. MUST be shared-to-web in Notion so logged-out leads can open it.
  var CH1_URL =
    "https://app.notion.com/p/Chapter-1-How-Meta-actually-works-37f76a31b37a80429ed0df5ba812f443";

  var modal;

  function build() {
    var css = document.createElement("style");
    css.textContent =
      ".opb-lead-ov{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(10,10,8,.72);backdrop-filter:blur(4px);padding:20px}" +
      ".opb-lead-ov.on{display:flex}" +
      ".opb-lead{background:#1B1A16;border:1px solid #2C2A24;border-radius:16px;max-width:420px;width:100%;padding:30px 28px;font-family:Inter,system-ui,sans-serif;color:#ECEAE3;box-shadow:0 30px 80px rgba(0,0,0,.5)}" +
      ".opb-lead h3{font-family:Newsreader,Georgia,serif;font-weight:600;font-size:1.5rem;margin:0 0 8px}" +
      ".opb-lead p{color:#8E8A7F;font-size:.95rem;margin:0 0 18px;line-height:1.5}" +
      ".opb-lead input{width:100%;padding:13px 14px;margin-bottom:12px;background:#121210;border:1px solid #2C2A24;border-radius:8px;color:#ECEAE3;font-size:1rem;font-family:inherit;box-sizing:border-box}" +
      ".opb-lead input:focus{outline:2px solid #E8893A;border-color:#E8893A}" +
      ".opb-lead button.go{width:100%;padding:14px;background:#E8893A;color:#1a1206;border:none;border-radius:8px;font-weight:600;font-size:1rem;cursor:pointer;font-family:inherit}" +
      ".opb-lead button.go:hover{background:#F29A4D}" +
      ".opb-lead .x{float:right;cursor:pointer;color:#8E8A7F;font-size:1.4rem;line-height:1;background:none;border:none;padding:0;width:auto}" +
      ".opb-lead .err{color:#E5604E;font-size:.85rem;margin:-4px 0 10px;min-height:1em}" +
      ".opb-lead .fine{color:#8E8A7F;font-size:.78rem;margin-top:12px;text-align:center}";
    document.head.appendChild(css);

    modal = document.createElement("div");
    modal.className = "opb-lead-ov";
    modal.innerHTML =
      '<div class="opb-lead" role="dialog" aria-modal="true" aria-label="Read Chapter 1 free">' +
      '<button class="x" aria-label="Close">&times;</button>' +
      "<h3>Read Chapter 1, free</h3>" +
      '<p>Pop in your email and we\'ll open Chapter 1 — "How Meta actually works" — and send you a copy. No spam; unsubscribe anytime.</p>' +
      '<input type="text" id="opb-lead-name" placeholder="First name (optional)" autocomplete="given-name">' +
      '<input type="email" id="opb-lead-email" placeholder="you@email.com" autocomplete="email" required>' +
      '<div class="err" id="opb-lead-err"></div>' +
      '<button class="go" id="opb-lead-go">Send me Chapter 1 &rarr;</button>' +
      '<div class="fine">Free chapter · the full 11-chapter playbook is &#8377;999</div>' +
      "</div>";
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.classList.contains("x")) close();
    });
    modal.querySelector("#opb-lead-go").addEventListener("click", submit);
    modal.querySelector("#opb-lead-email").addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
    });
  }

  function open() {
    if (!modal) build();
    modal.classList.add("on");
    setTimeout(function () {
      var el = modal.querySelector("#opb-lead-email");
      if (el) el.focus();
    }, 50);
  }
  function close() {
    if (modal) modal.classList.remove("on");
  }

  async function submit() {
    var emailEl = modal.querySelector("#opb-lead-email");
    var nameEl = modal.querySelector("#opb-lead-name");
    var errEl = modal.querySelector("#opb-lead-err");
    var btn = modal.querySelector("#opb-lead-go");
    var email = (emailEl.value || "").trim();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errEl.textContent = "Please enter a valid email.";
      return;
    }
    errEl.textContent = "";
    btn.textContent = "Sending…";
    btn.disabled = true;

    try {
      var r = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, name: (nameEl.value || "").trim() }),
      });
      var d = await r.json();
      if (r.ok && d.ok) {
        window.location.href = CH1_URL;
      } else {
        errEl.textContent = d.error || "Something went wrong. Please try again.";
        btn.textContent = "Send me Chapter 1 →";
        btn.disabled = false;
      }
    } catch (e) {
      errEl.textContent = "Network error. Please try again.";
      btn.textContent = "Send me Chapter 1 →";
      btn.disabled = false;
    }
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-lead]");
    if (!t) return;
    e.preventDefault();
    open();
  });
})();
