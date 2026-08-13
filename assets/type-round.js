/* ============================================================
   Shared "type to guess" round engine
   Used by type-solo.html, versus.html, teams.html.

   Expected DOM on each page:
     [data-section="setup"]   initial screen (form / intro)
     [data-section="play"]    the timer + guess entry
     [data-section="result"]  final standings
   ============================================================ */
(function () {
  "use strict";

  var MIN_TIME = 3;
  var MAX_TIME = 12;

  var lastContestants = null;
  var lastMode = null;
  var contestants = [];
  var guesses = [];     // number | "skip" | null (not yet entered)
  var turn = 0;
  var target = 0;
  var timer = null;

  function sfx() { return window.GameSounds; }

  function $(id) { return document.getElementById(id); }
  function section(name) { return document.querySelector('[data-section="' + name + '"]'); }
  function showSection(name) {
    ["setup", "play", "result"].forEach(function (s) {
      var el = section(s);
      if (el) el.classList.toggle("hidden", s !== name);
    });
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function randomTarget() {
    return +(MIN_TIME + Math.random() * (MAX_TIME - MIN_TIME)).toFixed(2);
  }
  function verdictFor(d) {
    if (d < 0.1) return "🎯 Perfect! Incredible timing.";
    if (d < 0.3) return "🔥 Excellent!";
    if (d < 0.7) return "👍 Nice job!";
    if (d < 1.5) return "🙂 Not bad, try again!";
    return "😅 Keep practicing!";
  }

  function setPlayTitle(mode) {
    var el = $("playTitle");
    if (!el) return;
    el.textContent = mode === "teams" ? "🏆 Teams"
                   : mode === "versus" ? "👥 Versus"
                   : "⌨️ Type & Guess";
  }

  function start(list, mode) {
    contestants = list;
    guesses = list.map(function () { return null; });
    turn = 0;
    target = randomTarget();
    lastContestants = list;
    lastMode = mode;

    if ($("guessError")) $("guessError").hidden = true;
    if ($("guessInput")) $("guessInput").value = "";
    var form = $("guessForm");
    var pass = $("passScreen");
    var skip = $("guessSkip");
    if (form) form.classList.add("hidden");
    if (pass) pass.classList.add("hidden");
    if (skip) skip.classList.add("hidden");
    setPlayTitle(mode);
    showSection("play");
    runCountdown();
  }

  function runCountdown() {
    var display = $("playDisplay");
    display.className = "display-text countdown";
    var n = 3;
    display.textContent = n;
    if (sfx()) sfx().countdown(n);
    var cd = setInterval(function () {
      n--;
      if (n > 0) {
        display.textContent = n;
        if (sfx()) sfx().countdown(n);
        return;
      }
      clearInterval(cd);
      display.textContent = "Go!";
      if (sfx()) { sfx().countdown(0); sfx().start(); }
      setTimeout(beginHiddenTimer, 350);
    }, 800);
  }

  function beginHiddenTimer() {
    var display = $("playDisplay");
    display.className = "display-text running";
    startFlicker(display, target);
    timer = setTimeout(function () {
      stopFlicker();
      display.className = "display-text done";
      display.textContent = "⏹ Time's up!";
      if (sfx()) sfx().stop();
      setTimeout(promptNextPlayer, 700);
    }, target * 1000);
  }

  // Rapidly cycle random-looking hundredth-of-second values so the
  // display feels alive during screen recordings. The numbers are FAKE
  // and never reveal the real elapsed time.
  var flickerInterval = null;
  function startFlicker(display, realTarget) {
    stopFlicker();
    var upper = Math.max(15, realTarget + 6);
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function tick() {
      var sec = Math.floor(Math.random() * upper);
      var frac = Math.floor(Math.random() * 100);
      display.textContent = pad(sec) + "." + (frac < 10 ? "0" + frac : frac) + "s";
    }
    tick();
    flickerInterval = setInterval(tick, 45);
  }
  function stopFlicker() {
    if (flickerInterval) { clearInterval(flickerInterval); flickerInterval = null; }
  }

  function promptNextPlayer() {
    if (turn >= contestants.length) { renderResults(); return; }
    var c = contestants[turn];
    var form = $("guessForm");
    var pass = $("passScreen");
    var skipBtn = $("guessSkip");
    form.classList.remove("hidden");
    pass.classList.add("hidden");
    if ($("guessError")) $("guessError").hidden = true;
    if (skipBtn) skipBtn.classList.remove("hidden");

    var prompt = $("guessPrompt");
    if (lastMode === "teams") {
      prompt.innerHTML = "<strong>" + esc(c.name) + "</strong> " +
        '<span style="color:var(--muted);font-weight:400">(' + esc(c.team) + ")</span> — your guess";
    } else if (lastMode === "versus") {
      prompt.innerHTML = "<strong>" + esc(c.name) + "</strong> — your guess";
    } else {
      prompt.textContent = "How long did the timer run?";
    }
    var input = $("guessInput");
    input.value = "";
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
  }

  function skipCurrentPlayer() {
    guesses[turn] = "skip";
    turn++;
    if ($("guessSkip")) $("guessSkip").classList.add("hidden");
    if (sfx()) sfx().skip();
    if (turn >= contestants.length) { renderResults(); return; }

    $("guessForm").classList.add("hidden");
    var pass = $("passScreen");
    pass.classList.remove("hidden");
    var next = contestants[turn];
    $("passLocked").textContent = "No guess — passing on.";
    $("passNext").textContent = lastMode === "teams"
      ? "Pass the device to " + next.name + " (" + next.team + ")"
      : "Pass the device to " + next.name;
  }

  function onSubmit(e) {
    e.preventDefault();
    var input = $("guessInput");
    var raw = input.value.trim().replace(",", ".");
    var val = Number(raw);
    if (raw === "" || isNaN(val) || val < 0) {
      $("guessError").hidden = false;
      if (sfx()) sfx().error();
      input.focus();
      return;
    }
    guesses[turn] = +val.toFixed(2);
    turn++;
    if (sfx()) sfx().lock();
    if ($("guessSkip")) $("guessSkip").classList.add("hidden");
    if (turn >= contestants.length) { renderResults(); return; }

    $("guessForm").classList.add("hidden");
    var pass = $("passScreen");
    pass.classList.remove("hidden");
    var next = contestants[turn];
    $("passLocked").textContent = "Guess locked in.";
    $("passNext").textContent = lastMode === "teams"
      ? "Pass the device to " + next.name + " (" + next.team + ")"
      : "Pass the device to " + next.name;
  }

  function renderResults() {
    var targetEl = $("resultTarget");
    var body = $("resultBody");
    targetEl.textContent = target.toFixed(2) + "s";
    targetEl.classList.add("revealed");
    body.innerHTML = "";

    var summary = "";

    if (lastMode === "teams") {
      var teamMap = {};
      contestants.forEach(function (c, idx) {
        if (!teamMap[c.teamIndex]) teamMap[c.teamIndex] = { name: c.team, members: [] };
        teamMap[c.teamIndex].members.push({ name: c.name, guess: guesses[idx] });
      });
      var teamStats = Object.keys(teamMap).map(function (k) {
        var t = teamMap[k];
        var valid = t.members.filter(function (m) { return m.guess !== "skip"; });
        if (valid.length === 0) { t.avgErr = Infinity; }
        else {
          var errs = valid.map(function (m) { return Math.abs(m.guess - target); });
          t.avgErr = errs.reduce(function (a, b) { return a + b; }, 0) / errs.length;
        }
        return t;
      });
      teamStats.sort(function (a, b) { return a.avgErr - b.avgErr; });
      var best = teamStats[0].avgErr;
      var anyValid = isFinite(best);

      var banner = document.createElement("div");
      banner.className = "winner-banner";
      banner.textContent = anyValid ? "🏆 " + teamStats[0].name + " wins!"
                                    : "No guesses entered — answer revealed below.";
      body.appendChild(banner);
      if (anyValid && sfx()) sfx().celebrate();
      if (anyValid) {
        summary = "🏆 " + teamStats[0].name + " won Guess the Time! The time was " +
                  target.toFixed(2) + "s. Can you beat them?";
      } else {
        summary = "The time was " + target.toFixed(2) + "s. Play Guess the Time!";
      }

      teamStats.forEach(function (t, i) {
        var win = anyValid && t.avgErr === best;
        var sec = document.createElement("div");
        sec.className = "team-section";
        var rows = t.members.map(function (m) {
          var guessCell, offCell;
          if (m.guess === "skip") {
            guessCell = '<span style="color:var(--muted);font-style:italic">skipped</span>';
            offCell = "—";
          } else {
            var d = m.guess - target;
            var sign = d >= 0 ? "+" : "−";
            guessCell = m.guess.toFixed(2) + "s";
            offCell = sign + Math.abs(d).toFixed(2) + "s";
          }
          return '<tr class="' + (win ? "winner" : "") + '">' +
            "<td>" + esc(m.name) + "</td>" +
            '<td class="guess">' + guessCell + "</td>" +
            '<td class="off">' + offCell + "</td>" +
            "</tr>";
        }).join("");
        var avgLabel = isFinite(t.avgErr) ? "avg off " + t.avgErr.toFixed(2) + "s" : "no guesses";
        sec.innerHTML =
          "<h4>" + (i + 1) + ". " + esc(t.name) +
          '<span style="color:' + (win ? "var(--gold)" : "var(--muted)") +
          ';text-transform:none;letter-spacing:0">' + avgLabel + "</span></h4>" +
          '<table class="result-table"><tbody>' + rows + "</tbody></table>";
        body.appendChild(sec);
      });
    }

    else {
      var all = contestants.map(function (c, idx) {
        var g = guesses[idx];
        return { name: c.name, guess: g, err: g === "skip" ? Infinity : Math.abs(g - target) };
      });
      var rows = all.filter(function (r) { return r.guess !== "skip"; });
      rows.sort(function (a, b) { return a.err - b.err; });
      var bestErr = rows.length ? rows[0].err : Infinity;

      var b = document.createElement("div");
      b.className = "winner-banner";
      var celebrate = true;
      if (rows.length === 0) {
        b.textContent = "No guesses — the answer is shown above.";
        celebrate = false;
        summary = "The time was " + target.toFixed(2) + "s. Play Guess the Time!";
      } else if (lastMode === "type-solo") {
        b.textContent = verdictFor(bestErr);
        celebrate = bestErr < 0.7;
        summary = "I played Guess the Time — the time was " + target.toFixed(2) +
                  "s and I was off by " + bestErr.toFixed(2) + "s. Can you do better?";
      } else {
        var winners = rows.filter(function (r) { return r.err === bestErr; })
                          .map(function (r) { return r.name; });
        b.textContent = winners.length > 1 ? "🏆 Tie: " + winners.join(" & ") + "!"
                                          : "🏆 " + winners[0] + " wins!";
        summary = (winners.length > 1 ? winners.join(" & ") + " tied" : winners[0] + " won") +
                  " at Guess the Time! The time was " + target.toFixed(2) + "s.";
      }
      body.appendChild(b);
      if (celebrate && sfx()) {
        sfx().win();
        setTimeout(function () {
          if (window.GameSounds && window.GameSounds.celebrate) window.GameSounds.celebrate();
        }, 30);
      }

      var rankMap = {};
      rows.forEach(function (r, i) { rankMap[r.name + "|" + r.guess] = i + 1; });

      var table = document.createElement("table");
      table.className = "result-table";
      table.innerHTML =
        "<thead><tr><th>#</th><th>Player</th><th class='guess'>Guess</th><th class='off'>Off by</th></tr></thead><tbody>" +
        all.map(function (r) {
          if (r.guess === "skip") {
            return '<tr><td class="pos">—</td><td>' + esc(r.name) +
              '</td><td class="guess"><span style="color:var(--muted);font-style:italic">skipped</span></td>' +
              '<td class="off">—</td></tr>';
          }
          var isBest = r.err === bestErr && rows.length > 0;
          return '<tr class="' + (isBest ? "winner" : "") + '">' +
            '<td class="pos">' + (isBest ? "🥇" : rankMap[r.name + "|" + r.guess]) + "</td>" +
            "<td>" + esc(r.name) + "</td>" +
            '<td class="guess">' + r.guess.toFixed(2) + "s</td>" +
            '<td class="off">' + r.err.toFixed(2) + "s</td>" +
            "</tr>";
        }).join("") +
        "</tbody>";
      body.appendChild(table);
    }

    buildShareButton(body, summary);
    showSection("result");
  }

  // ---- Share row (native share + copy/Twitter/WhatsApp fallback) ----
  function buildShareButton(container, summary) {
    var existing = document.getElementById("gtt-share-row");
    if (existing) existing.remove();

    var row = document.createElement("div");
    row.id = "gtt-share-row";
    row.className = "share-row";
    row.innerHTML =
      '<button type="button" class="btn btn-start share-main" id="gttShareBtn">📤 Share your result</button>' +
      '<div class="share-alt" id="gttShareAlt" hidden>' +
        '<button type="button" class="share-chip" data-share="copy">🔗 Copy link</button>' +
        '<button type="button" class="share-chip" data-share="twitter">🐦 Twitter</button>' +
        '<button type="button" class="share-chip" data-share="whatsapp">💬 WhatsApp</button>' +
      '</div>' +
      '<p class="share-toast" id="gttShareToast" hidden>Link copied!</p>';
    container.appendChild(row);

    var shareUrl = window.location.origin + window.location.pathname;
    var text = summary || "Play Guess the Time!";
    var mainBtn = row.querySelector("#gttShareBtn");
    var alt = row.querySelector("#gttShareAlt");
    var toast = row.querySelector("#gttShareToast");

    mainBtn.addEventListener("click", function () {
      if (navigator.share) {
        navigator.share({ title: "Guess the Time", text: text, url: shareUrl }).catch(function () {});
      } else {
        alt.hidden = !alt.hidden;
      }
    });

    alt.addEventListener("click", function (e) {
      var b = e.target.closest("[data-share]");
      if (!b) return;
      var kind = b.getAttribute("data-share");
      if (kind === "copy") {
        var full = text + " " + shareUrl;
        var done = function () { toast.hidden = false; setTimeout(function () { toast.hidden = true; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(full).then(done).catch(done);
        } else {
          var ta = document.createElement("textarea");
          ta.value = full; document.body.appendChild(ta); ta.select();
          try { document.execCommand("copy"); done(); } catch (err) {}
          ta.remove();
        }
      } else if (kind === "twitter") {
        window.open("https://twitter.com/intent/tweet?text=" +
          encodeURIComponent(text) + "&url=" + encodeURIComponent(shareUrl),
          "_blank", "noopener");
      } else if (kind === "whatsapp") {
        window.open("https://wa.me/?text=" + encodeURIComponent(text + " " + shareUrl),
          "_blank", "noopener");
      }
    });
  }

  function replay() {
    if (lastContestants) start(lastContestants.slice(), lastMode);
  }
  function newGame() {
    showSection("setup");
  }

  // ----- On-screen numeric pad -----
  function getInput() { return $("guessInput"); }

  function pressKey(key) {
    var input = getInput();
    if (!input) return;
    var v = input.value || "";

    if (key === "clear") { input.value = ""; if (sfx()) sfx().back(); return; }
    if (key === "back")  { input.value = v.slice(0, -1); if (sfx()) sfx().back(); return; }
    if (key === ".") {
      if (v.indexOf(".") !== -1) { if (sfx()) sfx().error(); return; }
      input.value = v === "" ? "0." : v + ".";
      if (sfx()) sfx().tap();
      return;
    }
    if (/^[0-9]$/.test(key)) {
      if (v.length >= 6) { if (sfx()) sfx().error(); return; }
      var parts = v.split(".");
      if (parts.length === 2 && parts[1].length >= 2) { if (sfx()) sfx().error(); return; }
      input.value = v + key;
      if (sfx()) sfx().tap();
    }
  }

  function wireNumpad() {
    var pad = $("numpad");
    if (!pad || pad.dataset.wired) return;
    pad.dataset.wired = "1";
    pad.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-key]");
      if (!btn) return;
      pressKey(btn.getAttribute("data-key"));
      var input = getInput();
      if (input) { input.focus(); if ($("guessError")) $("guessError").hidden = true; }
    });

    var input = getInput();
    if (input) {
      input.addEventListener("keydown", function (e) {
        if (/^[0-9.]$/.test(e.key)) { e.preventDefault(); pressKey(e.key); }
        else if (e.key === "Backspace") { e.preventDefault(); pressKey("back"); }
        else if (e.key === "Delete")    { e.preventDefault(); pressKey("clear"); }
        else if (e.key === "Enter")     { e.preventDefault();
          if ($("guessForm")) $("guessForm").requestSubmit(); }
        else if (e.key.length === 1)    { e.preventDefault(); }
        if ($("guessError")) $("guessError").hidden = true;
      });
      document.addEventListener("click", function (e) {
        var form = $("guessForm");
        if (!form || form.classList.contains("hidden")) return;
        if (e.target.closest && e.target.closest(".numpad")) return;
        if (e.target === input) return;
        if (e.target.closest && e.target.closest("button")) return;
        setTimeout(function () { if (document.activeElement !== input) input.focus(); }, 0);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireNumpad();
    var form = $("guessForm");
    if (form) form.addEventListener("submit", onSubmit);
    var ready = $("passReady");
    if (ready) ready.addEventListener("click", promptNextPlayer);
    var skipBtn = $("guessSkip");
    if (skipBtn) skipBtn.addEventListener("click", skipCurrentPlayer);
    var replayBtn = $("replayBtn");
    if (replayBtn) replayBtn.addEventListener("click", replay);
    var newGameBtn = $("newGameBtn");
    if (newGameBtn) newGameBtn.addEventListener("click", newGame);
  });

  window.TypeRound = { start: start };
})();
