/* ============================================================
   Ad-block / Brave Shields detector  (v2 — multi-signal)
   ------------------------------------------------------------
   Detects ad blockers using TWO independent signals so it works
   across Brave Standard mode (network blocking only), Aggressive
   mode (network + cosmetic), uBlock Origin, AdBlock Plus, etc.

   Signal 1 — COSMETIC BAIT:
     Off-screen elements whose IDs/classes are hidden by the major
     filter lists (EasyList, uBlock filters, Brave lists). If any
     bait gets display:none / zero-sized, a cosmetic blocker is on.

   Signal 2 — NETWORK PROBE:
     Injects the real Google AdSense library <script>. If the
     request errors or times out, a network-level blocker (like
     Brave's default Shields) is preventing ad scripts from
     loading. This works even before AdSense is configured.

   If EITHER signal fires, the full-screen gate is shown.

   Bypass for local dev: set  window.ALLOW_ADBLOCK = true  before
   this script runs.
   ============================================================ */
(function () {
  "use strict";
  window.__appInitLoaded = true;

  if (window.ALLOW_ADBLOCK === true) return;

  var ADSENSE_BASE = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

  var BAIT_CLASSES = [
    "pub_300x250", "pub_728x90", "pub_468x60", "pub_728x15",
    "text-ad", "text_ad", "text_ads", "text-ad-links",
    "adsbox", "ads-box", "ad-block", "adblock", "ad-banner",
    "banner-ad", "advertising", "advertisement", "ad-unit",
    "ad_unit", "adunit", "sponsored_ad", "sponsored-ad",
    "adsbygoogle", "google_ads", "header-ad", "sidebar-ad",
    "footer-ad", "ad-space", "adspace", "ad-placement"
  ];
  var BAIT_IDS = [
    "ads", "advert", "adverts", "advertisement", "advertising",
    "adblock", "adblocker", "sponsored_ads", "google_ads",
    "adsbox", "ad-banner", "banner_ad", "ad_unit"
  ];

  var overlay = null;
  var checking = false;

  /* ---------- overlay UI ---------- */
  function injectStyles() {
    if (document.getElementById("abd-styles")) return;
    var s = document.createElement("style");
    s.id = "abd-styles";
    s.textContent =
      "#abd-overlay{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.97);" +
      "display:flex;align-items:center;justify-content:center;padding:1.5rem;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
      "#abd-box{max-width:480px;width:100%;background:#1e293b;border:1px solid #334155;" +
      "border-radius:16px;padding:2rem;text-align:center;color:#f1f5f9;" +
      "box-shadow:0 20px 60px rgba(0,0,0,.5)}" +
      "#abd-icon{font-size:3rem;margin-bottom:.75rem}" +
      "#abd-title{font-size:1.4rem;font-weight:700;margin-bottom:.5rem}" +
      "#abd-msg{color:#94a3b8;font-size:.95rem;line-height:1.55;margin-bottom:1.25rem}" +
      "#abd-msg strong{color:#e2e8f0}" +
      "#abd-msg a{color:#38bdf8}" +
      "#abd-retry{background:#38bdf8;color:#0f172a;border:none;border-radius:10px;" +
      "padding:.85rem 1.5rem;font-size:1rem;font-weight:700;cursor:pointer;width:100%;" +
      "transition:background .15s}" +
      "#abd-retry:hover{background:#0ea5e9}" +
      "#abd-retry:disabled{opacity:.6;cursor:wait}" +
      "#abd-foot{margin-top:1rem;font-size:.8rem;color:#64748b;line-height:1.45}";
    document.head.appendChild(s);
  }

  function showOverlay() {
    if (overlay) return;
    injectStyles();
    overlay = document.createElement("div");
    overlay.id = "abd-overlay";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML =
      '<div id="abd-box">' +
      '<div id="abd-icon">🛡️</div>' +
      '<div id="abd-title">Ad blocker detected</div>' +
      '<p id="abd-msg">' +
      'Guess the Second is completely free and is supported by ads. We keep ' +
      'ads unobtrusive so they never get in the way of gameplay. ' +
      'To continue, please <strong>disable your ad blocker</strong> — ' +
      'in Brave, click the Shields icon (🦁) in the address bar and turn ' +
      'shields <strong>off</strong> for this site — then re-check below.' +
      '</p>' +
      '<button id="abd-retry">I\'ve disabled it — re-check</button>' +
      '<div id="abd-foot">Ads keep this game free. Thank you for supporting us!<br>' +
      'Make sure to refresh the page if the button doesn\'t work.</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById("abd-retry").addEventListener("click", function (e) {
      e.preventDefault();
      runCheck(true);
    });
  }

  function removeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  /* ---------- signal 1: cosmetic bait ---------- */
  function elementIsHidden(el) {
    if (!el) return false;
    if (el.offsetParent === null) return true;
    if (el.offsetHeight === 0 || el.offsetWidth === 0) return true;
    var cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (cs && (cs.display === "none" || cs.visibility === "hidden" ||
               cs.opacity === "0" || parseFloat(cs.opacity) === 0)) {
      return true;
    }
    return false;
  }

  function checkBait() {
    var baits = [];

    // Bait A: big class list
    var a = document.createElement("div");
    a.className = BAIT_CLASSES.join(" ");
    a.innerHTML = "&nbsp;";

    // Bait B: ad-like id + class + role
    var b = document.createElement("div");
    b.id = "adsbox";
    b.setAttribute("class", "ad advertisement text-ad pub_728x90");
    b.setAttribute("role", "banner");
    b.innerHTML = '<span class="text-ad-links">advertisement</span>';

    // Bait C: iframe-style ad container (common block target)
    var c = document.createElement("div");
    c.id = "google_ads";
    c.className = "adsbygoogle ad-unit";
    c.setAttribute("data-ad-client", "ca-pub-0000000000000000");
    c.innerHTML = "&nbsp;";

    [a, b, c].forEach(function (el) {
      el.setAttribute("aria-hidden", "true");
      el.style.cssText =
        "position:absolute;left:-9999px;top:-9999px;" +
        "width:100px;height:100px;overflow:hidden;pointer-events:none;";
      document.body.appendChild(el);
      baits.push(el);
    });

    var blocked = baits.some(elementIsHidden);

    // clean up
    baits.forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    return blocked;
  }

  /* ---------- signal 2: network probe ----------
     Loads the real AdSense library WITHOUT a client param so the file
     initializes window.adsbygoogle cleanly regardless of whether the
     publisher is approved yet.

     - onload + adsbygoogle defined  => not blocked
     - onload but adsbygoogle missing => blocker redirected to a blank
       resource (common trick) => blocked
     - onerror => blocked at network/DNS level
     - timeout => blocked (ads could not run anyway)                       */
  function checkNetwork() {
    return new Promise(function (resolve) {
      // If ads.js already loaded the real library and it initialized,
      // ad scripts clearly aren't blocked.
      if (window.adsbygoogle && typeof window.adsbygoogle === "object") {
        resolve(false);
        return;
      }

      // Don't add a second copy if ads.js already injected one.
      var existing = document.querySelector('script[src^="' + ADSENSE_BASE + '"]');
      if (existing) {
        // Give the existing script a moment to execute, then re-check.
        setTimeout(function () {
          resolve(typeof window.adsbygoogle === "undefined");
        }, 300);
        return;
      }

      // Cache-buster so a cached "success" can't mask a real block, and
      // no client param so the library sets up the global unconditionally.
      var url = ADSENSE_BASE + "?cb=" + Date.now();

      var done = false;
      var s = document.createElement("script");
      s.async = true;
      s.src = url;

      var finish = function (blocked) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        resolve(blocked);
      };

      // The script is small and loads fast when unblocked; 6s ceiling so
      // slow mobile connections aren't falsely flagged.
      var timer = setTimeout(function () { finish(true); }, 6000);

      s.onload = function () {
        // The real adsbygoogle.js unconditionally defines window.adsbygoogle.
        // If it's missing despite onload, a blocker returned a blank/redirected
        // response instead of the real file -> treat as blocked.
        if (typeof window.adsbygoogle === "undefined") {
          // Give it one extra tick in case execution is delayed.
          setTimeout(function () {
            finish(typeof window.adsbygoogle === "undefined");
          }, 100);
        } else {
          finish(false);
        }
      };
      s.onerror = function () { finish(true); };

      (document.head || document.documentElement).appendChild(s);
    });
  }

  /* ---------- main check ----------
     Detection strategy:
     - Always run the cosmetic bait check (works with any filter list).
     - Only run the live network probe once AdSense is actually ENABLED
       in assets/ads.js. Before that there are no real ads to protect
       and hitting the AdSense endpoint without a valid client can
       produce false positives on some networks/browsers.                    */
  function runCheck(isRetry) {
    if (checking) return;
    checking = true;

    if (isRetry && overlay) {
      var btn = document.getElementById("abd-retry");
      if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
    }

    var baitBlocked = false;
    try { baitBlocked = checkBait(); } catch (e) { /* ignore */ }

    var adsenseOn = window.SITE_CONFIG && window.SITE_CONFIG.adsenseEnabled === true;

    var decide = function (networkBlocked) {
      var blocked = adsenseOn ? (baitBlocked || networkBlocked) : baitBlocked;

      // Final safety: if AdSense is on but its global never appeared,
      // ads can't run, so treat as blocked.
      if (!blocked && adsenseOn && typeof window.adsbygoogle === "undefined") {
        blocked = true;
      }

      if (blocked) showOverlay();
      else removeOverlay();
      checking = false;
    };

    if (adsenseOn) {
      checkNetwork().then(decide);
    } else {
      decide(false);
    }
  }

  function init() {
    if (!document.body) { setTimeout(init, 50); return; }
    // Wait a tick so the browser/ad-blocker has applied its filters.
    setTimeout(function () { runCheck(false); }, 600);
  }

  init();

  // ---- Developer test hooks ----
  // Force the overlay to appear regardless of detection (for previewing
  // the UI). Trigger by adding ?adblocktest=1 to any URL, or call
  // ADBlockDetect.forceShow() from the browser console.
  function forceShow() { showOverlay(); }
  function forceHide() { removeOverlay(); }

  if (/[?&]adblocktest=1/i.test(window.location.search) ||
      /#adblock$/i.test(window.location.hash)) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", forceShow);
    } else {
      forceShow();
    }
  }

  window.ADBlockDetect = {
    run: function () { runCheck(true); },
    forceShow: forceShow,
    forceHide: forceHide,
    // expose for debugging
    _checkBait: checkBait,
    _checkNetwork: checkNetwork
  };
})();
