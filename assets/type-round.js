/* ============================================================
   Shared "type to guess" round engine
   Used by type-solo.html, versus.html, teams.html.

   Expected DOM on each page:
     [data-section="setup"]   initial screen (form / intro)
     [data-section="play"]    the timer + guess entry
     [data-section="result"]  round results / final standings

   Teams mode runs as a round-robin: round 1 = player 1 of every
   team on the same hidden time, round 2 = player 2 of every team
   on a fresh hidden time, and so on. A round-result screen is
   shown after each round; final team standings after the last.
   ============================================================ */
(function () {
  "use strict";

  var MIN_TIME = 3;
  var MAX_TIME = 12;

  // The running display flickers random clock-style values (e.g. 12:34)
  // and settles on ??:?? when the timer ends. The values are pure noise —
  // they carry no information about the real elapsed time and can't be
  // mistaken for the seconds answer players have to type.

  var lastContestants = null;
  var lastMode = null;
  var contestants = [];   // players in the CURRENT round
  var guesses = [];       // number | "skip" | null (not yet entered)
  var turn = 0;
  var target = 0;         // hidden time for the current round
  var timer = null;

  // --- teams round-robin state ---
  var roster = [];        // [{ name, teamIndex, players: [{name, team, teamIndex, pos}] }]
  var roundIdx = 0;       // 0-based round = player position - 1
  var totalRounds = 0;    // max players on any team
  var finalRows = [];     // accumulated results: {name, team, teamIndex, pos, round, guess, target}

  function sfx() { return window.GameSounds; }
  function $(id) { return document.getElementById(id); }
  function section(name) { return document.querySelector('[data-section="' + name + '"]'); }
  function showSection(name) {
    ["setup", "play", "result"].forEach(function (s) {
      var el = section(s);
      if (el) el.classList.toggle("hidden", s !== name);
    });
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
  function scrollToResult() {
    // Roll the page all the way to the top so no part of the result is
    // cut off (setup/play are hidden at this point, so the result card
    // sits right below the header).
    try { window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (e) { window.scrollTo(0, 0); }
  }

  function setPlayTitle(mode) {
    var el = $("playTitle");
    if (!el) return;
    el.textContent = mode === "teams"
      ? "🏆 Round " + (roundIdx + 1) + " of " + totalRounds
      : mode === "versus" ? "👥 Versus"
      : "⌨️ Type & Guess";
  }
  function setPlayInfo() {
    var el = $("playInfo");
    if (!el) return;
    el.textContent = "Every team's Player " + (roundIdx + 1) +
      " gets the same hidden time — a random time between " + MIN_TIME + " and " + MAX_TIME + " seconds.";
  }

  function resetPlayUI() {
    if ($("guessError")) $("guessError").hidden = true;
    if ($("guessInput")) $("guessInput").value = "";
    var form = $("guessForm");
    var pass = $("passScreen");
    var skip = $("guessSkip");
    if (form) form.classList.add("hidden");
    if (pass) pass.classList.add("hidden");
    if (skip) skip.classList.add("hidden");
    var nextBtn = $("nextRoundBtn");
    if (nextBtn) nextBtn.classList.add("hidden");
  }

  function start(list, mode) {
    lastContestants = list;
    lastMode = mode;

    if (mode === "teams") {
      buildRoster(list);
      roundIdx = 0;
      finalRows = [];
      beginRound();
      return;
    }

    contestants = list;
    guesses = list.map(function () { return null; });
    turn = 0;
    target = randomTarget();
    resetPlayUI();
    setPlayTitle(mode);
    showSection("play");
    runCountdown();
  }

  // ---- teams round-robin ----
  function buildRoster(list) {
    var map = {}, order = [];
    list.forEach(function (c) {
      if (!map[c.teamIndex]) {
        map[c.teamIndex] = { name: c.team, teamIndex: c.teamIndex, players: [] };
        order.push(c.teamIndex);
      }
      var t = map[c.teamIndex];
      t.players.push({ name: c.name, team: c.team, teamIndex: c.teamIndex, pos: t.players.length });
    });
    roster = order.map(function (k) { return map[k]; });
    totalRounds = roster.reduce(function (m, t) {
      return Math.max(m, t.players.length);
    }, 0);
  }

  function beginRound() {
    contestants = [];
    roster.forEach(function (t) {
      if (t.players[roundIdx]) contestants.push(t.players[roundIdx]);
    });
    guesses = contestants.map(function () { return null; });
    turn = 0;
    target = randomTarget();
    resetPlayUI();
    setPlayTitle("teams");
    setPlayInfo();
    showSection("play");
    runCountdown();
  }

  function finishRound() {
    if (lastMode === "teams") {
      contestants.forEach(function (c, i) {
        finalRows.push({
          name: c.name, team: c.team, teamIndex: c.teamIndex, pos: c.pos,
          round: roundIdx + 1, guess: guesses[i], target: target
        });
      });
      renderRoundResult();
    } else {
      renderResults();
    }
  }

  function roundWinnerBanner(rows) {
    var valid = rows.filter(function (r) { return r.guess !== "skip"; })
                    .sort(function (a, b) { return a.err - b.err; });
    var best = valid.length ? valid[0].err : Infinity;
    return {
      best: best,
      valid: valid,
      winners: valid.filter(function (r) { return r.err === best; })
    };
  }

  function renderRoundResult() {
    var targetRow = $("targetRow");
    if (targetRow) targetRow.hidden = false;
    var targetEl = $("resultTarget");
    if (targetEl) {
      targetEl.textContent = target.toFixed(2) + "s";
      targetEl.classList.add("revealed");
    }
    var body = $("resultBody");
    body.innerHTML = "";

    var rows = contestants.map(function (c, i) {
      var g = guesses[i];
      return { name: c.name, team: c.team, guess: g, err: g === "skip" ? Infinity : Math.abs(g - target) };
    });
    var w = roundWinnerBanner(rows);

    var banner = document.createElement("div");
    banner.className = "winner-banner";
    if (!w.valid.length) {
      banner.textContent = "No guesses this round — the time was " + target.toFixed(2) + "s.";
    } else {
      var names = w.winners.map(function (r) { return r.name + " (" + r.team + ")"; });
      banner.textContent = "🎉 Round " + (roundIdx + 1) + " winner" +
        (w.winners.length > 1 ? "s (tie): " : ": ") + names.join(" & ") + "!";
      if (sfx()) sfx().celebrate();
    }
    body.appendChild(banner);

    var table = document.createElement("table");
    table.className = "result-table";
    table.innerHTML =
      "<thead><tr><th>Player</th><th>Team</th><th class='guess'>Guess</th><th class='off'>Off by</th></tr></thead><tbody>" +
      rows.map(function (r) {
        if (r.guess === "skip") {
          return "<tr><td>" + esc(r.name) + "</td><td>" + esc(r.team) + "</td>" +
            '<td class="guess"><span style="color:var(--muted);font-style:italic">skipped</span></td><td class="off">—</td></tr>';
        }
        return "<tr class='" + (r.err === w.best ? "winner" : "") + "'>" +
          "<td>" + esc(r.name) + "</td><td>" + esc(r.team) + "</td>" +
          '<td class="guess">' + r.guess.toFixed(2) + "s</td>" +
          '<td class="off">' + r.err.toFixed(2) + "s</td></tr>";
      }).join("") +
      "</tbody>";
    body.appendChild(table);

    body.appendChild(buildStandingsSoFar());

    var actions = $("resultActions");
    if (actions) actions.classList.add("hidden");
    var nextBtn = $("nextRoundBtn");
    if (nextBtn) {
      nextBtn.classList.remove("hidden");
      nextBtn.textContent = roundIdx + 1 >= totalRounds ? "🏁 See Final Results" : "Next Round ➜";
    }
    showSection("result");
    scrollToResult();
  }

  function buildStandingsSoFar() {
    var map = {};
    finalRows.forEach(function (r) {
      if (r.guess === "skip") return;
      if (!map[r.teamIndex]) map[r.teamIndex] = { name: r.team, errs: [] };
      map[r.teamIndex].errs.push(Math.abs(r.guess - r.target));
    });
    var teams = Object.keys(map).map(function (k) {
      var t = map[k];
      t.avg = t.errs.reduce(function (a, b) { return a + b; }, 0) / t.errs.length;
      return t;
    });
    teams.sort(function (a, b) { return a.avg - b.avg; });
    roster.forEach(function (t) {
      if (!map[t.teamIndex]) teams.push({ name: t.name, avg: Infinity });
    });

    var el = document.createElement("div");
    el.className = "round-standings";
    el.innerHTML = "<h4>📊 Standings so far</h4><ol>" +
      teams.map(function (t) {
        return "<li><span>" + esc(t.name) + "</span><span>" +
          (isFinite(t.avg) ? "avg off " + t.avg.toFixed(2) + "s" : "no guesses yet") +
          "</span></li>";
      }).join("") + "</ol>";
    return el;
  }

  function nextRound() {
    var nextBtn = $("nextRoundBtn");
    if (nextBtn) nextBtn.classList.add("hidden");
    if (sfx()) sfx().whoosh();
    if (roundIdx + 1 >= totalRounds) {
      renderFinalResults();
      return;
    }
    roundIdx++;
    beginRound();
  }

  function renderFinalResults() {
    var targetRow = $("targetRow");
    if (targetRow) targetRow.hidden = true; // no single time across rounds
    var body = $("resultBody");
    body.innerHTML = "";

    var summary = "";

    var teamMap = {};
    finalRows.forEach(function (r) {
      if (!teamMap[r.teamIndex]) teamMap[r.teamIndex] = { name: r.team, members: [] };
      teamMap[r.teamIndex].members.push(r);
    });
    var teamStats = Object.keys(teamMap).map(function (k) {
      var t = teamMap[k];
      var valid = t.members.filter(function (m) { return m.guess !== "skip"; });
      if (valid.length === 0) { t.avgErr = Infinity; }
      else {
        t.avgErr = valid.reduce(function (s, m) { return s + Math.abs(m.guess - m.target); }, 0) / valid.length;
      }
      return t;
    });
    teamStats.sort(function (a, b) { return a.avgErr - b.avgErr; });
    var best = teamStats[0].avgErr;
    var anyValid = isFinite(best);

    var banner = document.createElement("div");
    banner.className = "winner-banner";
    banner.textContent = anyValid ? "🏆 " + teamStats[0].name + " wins!"
                                  : "No guesses entered — nothing to score.";
    body.appendChild(banner);
    if (anyValid && sfx()) {
      sfx().win();
      setTimeout(function () {
        if (window.GameSounds && window.GameSounds.celebrate) window.GameSounds.celebrate();
      }, 260);
    }
    if (anyValid) {
      summary = "🏆 " + teamStats[0].name + " won Guess the Time teams mode! " +
                totalRounds + " round" + (totalRounds > 1 ? "s" : "") +
                ", lowest average error. Can you beat them?";
    } else {
      summary = "We played Guess the Time in teams! Can you beat our timing?";
    }

    teamStats.forEach(function (t, i) {
      var win = anyValid && t.avgErr === best;
      var sec = document.createElement("div");
      sec.className = "team-section";
      var rows = t.members.slice().sort(function (a, b) { return a.round - b.round; })
        .map(function (m) {
          var guessCell, offCell;
          if (m.guess === "skip") {
            guessCell = '<span style="color:var(--muted);font-style:italic">skipped</span>';
            offCell = "—";
          } else {
            var d = m.guess - m.target;
            var sign = d >= 0 ? "+" : "−";
            guessCell = m.guess.toFixed(2) + "s";
            offCell = sign + Math.abs(d).toFixed(2) + "s";
          }
          return '<tr class="' + (win ? "winner" : "") + '">' +
            "<td>R" + m.round + "</td>" +
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
        '<table class="result-table"><thead><tr><th>Round</th><th>Player</th>' +
        "<th class='guess'>Guess</th><th class='off'>Off by</th></tr></thead><tbody>" +
        rows + "</tbody></table>";
      body.appendChild(sec);
    });

    var actions = $("resultActions");
    if (actions) actions.classList.remove("hidden");
    buildShareButton(body, summary);
    showSection("result");
    scrollToResult();
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
    startFlicker(display);
    timer = setTimeout(function () {
      stopFlicker();
      display.className = "display-text done";
      display.textContent = "??:??";
      if (sfx()) sfx().stop();
      setTimeout(promptNextPlayer, 700);
    }, target * 1000);
  }

  // Flicker random clock-style MM:SS values so the display feels like
  // a running clock. Values are fake and never reveal elapsed time.
  var flickerInterval = null;
  function startFlicker(display) {
    stopFlicker();
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function tick() {
      display.textContent = pad(Math.floor(Math.random() * 60)) + ":" +
                            pad(Math.floor(Math.random() * 60));
    }
    tick();
    flickerInterval = setInterval(tick, 100);
  }
  function stopFlicker() {
    if (flickerInterval) { clearInterval(flickerInterval); flickerInterval = null; }
  }

  function promptNextPlayer() {
    if (turn >= contestants.length) { finishRound(); return; }
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
    if (turn >= contestants.length) { finishRound(); return; }

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
    if (turn >= contestants.length) { finishRound(); return; }

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

    buildShareButton(body, summary);
    showSection("result");
    scrollToResult();
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
    var nextBtn = $("nextRoundBtn");
    if (nextBtn) nextBtn.addEventListener("click", nextRound);
    var replayBtn = $("replayBtn");
    if (replayBtn) replayBtn.addEventListener("click", replay);
    var newGameBtn = $("newGameBtn");
    if (newGameBtn) newGameBtn.addEventListener("click", newGame);
  });

  window.TypeRound = { start: start };
})();
