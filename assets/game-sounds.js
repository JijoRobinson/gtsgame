/* ============================================================
   GAME SOUNDS  —  Web Audio synthesized SFX
   No audio files required. All sounds are generated in-browser.
   Exposes window.GameSounds. Mute preference is persisted.
   ============================================================ */
(function () {
  "use strict";

  var ctx = null, master = null;
  var muted = false;
  try { muted = localStorage.getItem("gtt_muted") === "1"; } catch (e) {}

  /* ---------- audio setup (unlocked on first gesture) ---------- */
  function init() {
    if (ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
  }
  function unlock() {
    init();
    if (ctx && ctx.state === "suspended") ctx.resume();
  }
  ["pointerdown", "touchstart", "keydown"].forEach(function (ev) {
    document.addEventListener(ev, unlock, { once: true, capture: true });
  });

  /* ---------- primitives ---------- */
  function tone(freq, opts) {
    if (muted || !ctx) return;
    opts = opts || {};
    var t = ctx.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.12;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    }
    var vol = opts.vol != null ? opts.vol : 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  function noise(dur, vol, opts) {
    if (muted || !ctx) return;
    opts = opts || {};
    var t = ctx.currentTime + (opts.delay || 0);
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = opts.filter || "bandpass";
    f.frequency.value = opts.freq || 800;
    f.Q.value = opts.q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t); src.stop(t + dur);
  }

  /* ---------- named sounds ---------- */
  var Sounds = {
    // small UI tap (numpad, generic buttons)
    tap: function () { tone(720, { type: "square", dur: 0.05, vol: 0.1, slide: 540 }); },
    // softer back/out sound
    back: function () { tone(420, { type: "square", dur: 0.06, vol: 0.09, slide: 280 }); },
    // 3-2-1 beeps; step 0 is the "Go!"
    countdown: function (step) {
      tone(step === 0 ? 988 : 523, { type: "triangle", dur: 0.2, vol: 0.26 });
    },
    // timer begins: rising sweep + airy whoosh
    start: function () {
      tone(260, { type: "sawtooth", dur: 0.4, vol: 0.1, slide: 880 });
      noise(0.35, 0.1, { freq: 1400, filter: "highpass" });
    },
    // timer ends: bright two-note chime
    stop: function () {
      tone(880, { type: "triangle", dur: 0.18, vol: 0.26 });
      tone(1318, { type: "triangle", dur: 0.3, vol: 0.22, delay: 0.11 });
    },
    // guess locked in: quick double blip
    lock: function () {
      tone(660, { type: "square", dur: 0.06, vol: 0.14 });
      tone(990, { type: "square", dur: 0.09, vol: 0.14, delay: 0.05 });
    },
    // skipped: soft downward blip
    skip: function () {
      tone(520, { type: "sine", dur: 0.2, vol: 0.18, slide: 200 });
    },
    // invalid input: low buzz
    error: function () {
      tone(180, { type: "sawtooth", dur: 0.25, vol: 0.16, slide: 80 });
    },
    // page/transition whoosh
    whoosh: function () { noise(0.25, 0.07, { freq: 500, filter: "lowpass" }); },
    // win: happy ascending arpeggio + sparkle
    win: function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone(f, { type: "triangle", dur: 0.22, vol: 0.25, delay: i * 0.09 });
      });
      tone(1568, { type: "sine", dur: 0.5, vol: 0.14, delay: 0.42 });
      tone(2093, { type: "sine", dur: 0.5, vol: 0.1, delay: 0.5 });
    },
    celebrate: function () {
      Sounds.win();
      confetti();
    },
    setMuted: function (v) {
      muted = !!v;
      try { localStorage.setItem("gtt_muted", muted ? "1" : "0"); } catch (e) {}
      updateMuteButton();
    },
    isMuted: function () { return muted; }
  };

  /* ---------- confetti burst ---------- */
  function confetti() {
    if (muted === null) { /* noop */ }
    var colors = ["#f43f5e", "#fbbf24", "#22c55e", "#38bdf8", "#a855f7", "#fb923c", "#ffffff"];
    var box = document.createElement("div");
    box.setAttribute("aria-hidden", "true");
    box.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99998;overflow:hidden";
    document.body.appendChild(box);
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var count = reduce ? 12 : 70;
    for (var i = 0; i < count; i++) {
      var p = document.createElement("div");
      var color = colors[i % colors.length];
      var left = Math.random() * 100;
      var size = 7 + Math.random() * 9;
      var dur = 1.8 + Math.random() * 2.2;
      var delay = Math.random() * 0.4;
      var rot = Math.random() * 360;
      var round = Math.random() > 0.6 ? "50%" : "3px";
      p.style.cssText =
        "position:absolute;top:-24px;left:" + left + "%;width:" + size + "px;height:" +
        (size * (Math.random() > 0.5 ? 0.6 : 1)) + "px;background:" + color +
        ";border-radius:" + round + ";opacity:.95";
      p.animate(
        [
          { transform: "translate3d(0,0,0) rotate(" + rot + "deg)", opacity: 1 },
          { transform: "translate3d(" + (Math.random() * 120 - 60) + "px," +
            (window.innerHeight + 40) + "px,0) rotate(" + (rot + 720) + "deg)", opacity: 0.85 }
        ],
        { duration: dur * 1000, delay: delay * 1000, easing: "cubic-bezier(.2,.6,.4,1)", fill: "forwards" }
      );
      box.appendChild(p);
    }
    setTimeout(function () { box.remove(); }, 5200);
  }

  /* ---------- mute toggle button ---------- */
  var muteBtn;
  function updateMuteButton() {
    if (!muteBtn) return;
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-label", muted ? "Unmute sounds" : "Mute sounds");
    muteBtn.title = muted ? "Sound off — click to turn on" : "Sound on — click to mute";
  }
  function buildMuteButton() {
    if (document.getElementById("gtt-mute")) return;
    muteBtn = document.createElement("button");
    muteBtn.id = "gtt-mute";
    muteBtn.type = "button";
    muteBtn.setAttribute("aria-label", "Toggle sound");
    muteBtn.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:9000;width:44px;height:44px;border-radius:50%;" +
      "border:2px solid rgba(255,255,255,.6);background:rgba(15,23,42,.55);color:#fff;font-size:1.2rem;" +
      "cursor:pointer;backdrop-filter:blur(6px);box-shadow:0 4px 12px rgba(0,0,0,.25);" +
      "display:flex;align-items:center;justify-content:center;transition:transform .1s;";
    muteBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      Sounds.setMuted(!muted);
      if (!muted) { init(); if (ctx && ctx.state === "suspended") ctx.resume(); Sounds.tap(); }
    });
    document.body.appendChild(muteBtn);
    updateMuteButton();
  }

  /* ---------- global tap sounds for generic controls ---------- */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("button, .mode-card, a.btn-hero, .btn");
    if (!el) return;
    // The guess form's buttons have their own specific sounds.
    if (el.closest && el.closest(".guess-form")) return;
    if (el.id === "gtt-mute") return;
    Sounds.tap();
  }, true);

  document.addEventListener("DOMContentLoaded", buildMuteButton);
  if (document.readyState !== "loading") buildMuteButton();

  window.GameSounds = Sounds;
})();
