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

  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');

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
