// Microsoft Clarity — session recordings + heatmaps. Project yeelxy94y9.
//
// WHY: 397 landing page views produced 9 InitiateCheckouts (2.3%). The Meta funnel
// tells us people leave; it cannot tell us where or why. Clarity records the session
// so we can watch the drop-off happen.
//
// PRIVACY: Clarity's default masking hides the CONTENT of text inputs, so the name
// and email typed into the lead and buy modals are not recorded. The PII fields also
// carry an explicit data-clarity-mask="true" (see lead.js / checkout.js) so masking
// does not depend on the default staying the default.
//
// Loaded from /clarity.js in <head> on every page, mirroring /pixel.js.

(function (c, l, a, r, i, t, y) {
  c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments) };
  t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
  y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
})(window, document, "clarity", "script", "yeelxy94y9");
