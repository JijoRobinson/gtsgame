/* ============================================================
   Google Analytics 4  —  quick setup
   ------------------------------------------------------------
   1. Create a GA4 property at https://analytics.google.com/
   2. Copy your Measurement ID (it looks like G-XXXXXXXXXX).
   3. Replace the value of GA4_ID below.
   Analytics automatically loads once a non-empty ID is set.
   ============================================================ */
(function () {
  var GA4_ID = ""; // e.g. "G-ABC123XYZ"

  if (!GA4_ID || GA4_ID.indexOf("G-") !== 0) return;

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GA4_ID, { anonymize_ip: true });
})();
