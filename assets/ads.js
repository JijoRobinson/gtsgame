/* ============================================================
   Google AdSense configuration  —  mobile / iPad optimized
   ------------------------------------------------------------
   HOW TO ENABLE ADS (do this only AFTER AdSense approval):
   1. Apply at https://www.google.com/adsense/ and get approved.
   2. Replace adsenseClient below with your publisher ID
      (looks like: ca-pub-1234567890123456).
   3. In AdSense, create ad units. For the best mobile/iPad
      revenue, use these formats:
        - top / bottom : "Display" (responsive) or 320x50 / 468x60
        - middle / game: "In-article" or a 300x250 rectangle
        - anchor       : "Anchor" ad (sticky bottom on mobile only)
   4. Paste each slot ID into adSlots below.
   5. Set adsenseEnabled to true.

   WHILE adsenseEnabled is false:
     - No AdSense library is loaded.
     - All [data-ad] slots are COLLAPSED (zero height, no margin),
       so visitors see nothing awkward while you wait for approval.
     - You can uncomment the DEV_PREVIEW line below to see where ads
       will appear while building the site.
   ============================================================ */
(function () {
  var CFG = {
    siteUrl: "https://www.guessthesecond.com", // TODO: your real domain
    adsenseClient: "ca-pub-0000000000000000",    // TODO: your publisher ID
    adsenseEnabled: false,                        // TODO: true AFTER approval
    // Set to true during local development if you want to SEE labeled
    // "Advertisement" placeholders without loading real ads. Has no
    // effect once adsenseEnabled is true.
    devPreview: false,
    adSlots: {
      top:    "0000000000",  // banner below header (responsive/320x50–728x90)
      middle: "0000000000",  // in-content rectangle (300x250 / in-article)
      bottom: "0000000000",  // rectangle before footer
      game:   "0000000000",  // below the game card (300x250)
      anchor: "0000000000"   // sticky bottom anchor (mobile only)
    }
  };
  window.SITE_CONFIG = CFG;

  function loadAdSenseLibrary() {
    if (!CFG.adsenseEnabled) return;
    if (document.getElementById("adsense-lib")) return;
    var s = document.createElement("script");
    s.id = "adsense-lib";
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + CFG.adsenseClient;
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);
  }

  // Fills a single ad slot element. In-content slots use responsive
  // formatting; the anchor slot is a special sticky mobile unit.
  function fillSlot(el, slotName) {
    if (CFG.adsenseEnabled && CFG.adSlots[slotName]) {
      el.classList.add("ad-slot");
      el.classList.remove("ad-hidden");
      if (slotName === "anchor") {
        buildAnchor(el, CFG.adSlots[slotName]);
        return;
      }
      el.innerHTML =
        '<ins class="adsbygoogle" ' +
        'style="display:block" ' +
        'data-ad-client="' + CFG.adsenseClient + '" ' +
        'data-ad-slot="' + CFG.adSlots[slotName] + '" ' +
        'data-ad-format="auto" ' +
        'data-full-width-responsive="true"></ins>';
      pushAd();
    } else if (CFG.devPreview) {
      // Dev mode: show a labeled placeholder so you can review placement.
      el.classList.add("ad-slot");
      el.classList.remove("ad-hidden");
      el.innerHTML = '<div class="ad-placeholder"><span>Advertisement</span></div>';
    } else {
      // Production, pre-approval: collapse the slot completely.
      el.classList.add("ad-hidden");
      el.innerHTML = "";
    }
  }

  // Builds the dismissible sticky bottom anchor shown only on phones.
  function buildAnchor(el, slotId) {
    if (window.innerWidth > 820) return;

    el.className = "ad-anchor visible";
    document.body.classList.add("ad-anchor-active");

    el.innerHTML =
      '<div class="anchor-inner">' +
        '<button class="anchor-close" type="button" aria-label="Dismiss ad">×</button>' +
        '<ins class="adsbygoogle" ' +
        'style="display:block" ' +
        'data-ad-client="' + CFG.adsenseClient + '" ' +
        'data-ad-slot="' + slotId + '" ' +
        'data-ad-format="horizontal" ' +
        'data-full-width-responsive="false"></ins>' +
      '</div>';

    var closeBtn = el.querySelector(".anchor-close");
    closeBtn.addEventListener("click", function () {
      el.classList.remove("visible");
      document.body.classList.remove("ad-anchor-active");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    });

    pushAd();
  }

  function fillAdSlots() {
    document.querySelectorAll("[data-ad]").forEach(function (el) {
      fillSlot(el, el.getAttribute("data-ad"));
    });
  }

  function pushAd() {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      // Library not loaded yet or slot not ready; retried below.
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    fillAdSlots();
    loadAdSenseLibrary();

    if (CFG.adsenseEnabled) {
      setTimeout(pushAd, 800);
      setTimeout(pushAd, 2000);
    }
  });
})();
