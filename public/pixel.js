// Meta Pixel — base code + a safe tracking helper. Loaded on every page.
// The pixel ID is public by design (it is visible in any browser's network tab).
// Events fired across the site:
//   PageView         — here, every page
//   Lead             — lead.js, after a successful free-Chapter-1 opt-in
//   InitiateCheckout — checkout.js, when the Razorpay modal opens
//   Purchase         — thank-you.html, once per verified payment (deduped)

(function () {
  var PIXEL_ID = "2057331878478659";

  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');

  // --- Advanced Matching -----------------------------------------------------
  // Meta can only optimise against conversions it can attribute to a person.
  // Passing identity with the event raises Event Match Quality, which is the
  // signal a Purchase/InitiateCheckout-optimised ad set actually learns from.
  //
  // We send ONLY what the visitor typed into our own forms (name + email), never
  // anything inferred or bought. fbevents.js hashes these with SHA-256 in the
  // browser before transmission — no plaintext address leaves the page.
  //
  // Normalisation matters: Meta hashes the exact string it is given, so
  // "  Mayank@Gmail.com " and "mayank@gmail.com" would produce different hashes
  // and simply fail to match. Trim + lowercase before handing it over.
  function normalize(email, name) {
    var d = {};
    var e = String(email || "").trim().toLowerCase();
    var n = String(name || "").trim().toLowerCase();
    if (e.indexOf("@") > 0) d.em = e;
    if (n) d.fn = n;
    return d;
  }

  function stored() {
    try {
      return normalize(localStorage.getItem("opb_email"), localStorage.getItem("opb_name"));
    } catch (e) {
      return {}; // private mode / storage blocked — fall through to an anonymous init
    }
  }

  var known = stored();
  if (known.em || known.fn) fbq('init', PIXEL_ID, known);
  else fbq('init', PIXEL_ID);

  fbq('track', 'PageView');

  // Re-init the moment we learn who someone is, so the Lead / InitiateCheckout
  // event fired seconds later carries matching data too — not just the next
  // pageview. Calling init again with the same id updates the matching payload;
  // it does not create a second pixel and does not re-fire PageView.
  window.opbIdentify = function (email, name) {
    try {
      var d = normalize(email, name);
      if (d.em || d.fn) fbq('init', PIXEL_ID, d);
    } catch (e) {
      /* no-op: matching is an optimisation, never a blocker */
    }
  };

  // Wrapper used by lead.js / checkout.js / thank-you.html.
  // Two jobs: (1) never throw — tracking must not be able to break checkout,
  // (2) pass an eventID so the same event can be deduped against a server-side
  //     CAPI send later without double-counting.
  window.opbTrack = function (name, params, eventID) {
    try {
      if (typeof fbq !== "function") return;
      fbq("track", name, params || {}, eventID ? { eventID: String(eventID) } : undefined);
    } catch (e) {
      /* no-op: a blocked or broken pixel must stay invisible to the user */
    }
  };
})();
