(function () {
  const { h, Q, TOPICS, byId, topicName, load, save, record, shuffle, prepare, questionCard, pct, fmtTime, modal, LETTERS } = EDKI;
  const app = document.getElementById("app");
  const TOTAL = 100, PASS = 60;
  let limitMin = 120;
  let timerId = null, keyHandler = null;

  /* Добір 100 питань: пропорційно до розміру тем, мінімум 3 на тему, без дублікатів за змістом. */
  function compose() {
    const pools = TOPICS.map((t) => ({ key: t.key, qs: shuffle(Q.filter((q) => q.t === t.key)) }));
    const sum = pools.reduce((s, p) => s + p.qs.length, 0);
    const quota = pools.map((p) => Math.max(3, Math.floor((TOTAL * p.qs.length) / sum)));
    let diff = TOTAL - quota.reduce((a, b) => a + b, 0);
    for (let i = 0; diff !== 0; i = (i + 1) % pools.length) {
      if (diff > 0 && quota[i] < pools[i].qs.length) { quota[i]++; diff--; }
      else if (diff < 0 && quota[i] > 3) { quota[i]--; diff++; }
    }
    const usedGroups = new Set(), picked = [];
    pools.forEach((p, i) => {
      let n = 0;
      for (const q of p.qs) {
        if (n >= quota[i]) break;
        if (q.g) { if (usedGroups.has(q.g)) continue; usedGroups.add(q.g); }
        picked.push(q); n++;
      }
    });
    return shuffle(picked).slice(0, TOTAL).map((q) => ({ id: q.id, order: shuffle([0, 1, 2, 3]) }));
  }

  function clear() {
    if (timerId) clearInterval(timerId); timerId = null;
    if (keyHandler) document.removeEventListener("keydown", keyHandler); keyHandler = null;
  }

  /* ---------- старт ---------- */
  function renderStart() {
    clear();
    const E = load().exam;
    const seg = h("div", { class: "seg" });
    const drawSeg = () => seg.replaceChildren(...[[60, "60 хв"], [90, "90 хв"], [120, "120 хв"], [0, "без таймера"]].map(([v, l]) =>
      h("button", { type: "button", "aria-pressed": String(limitMin === v), onclick: () => { limitMin = v; drawSeg(); } }, l)));
    drawSeg();
    app.replaceChildren(
      h("h1", { text: "ЄДКІ симулятор" }),
      h("p", { class: "lead", text: `${TOTAL} питань з усіх тем у пропорції до їх обсягу. Правильність і розбір — лише після завершення. Умовний прохідний бал у симуляторі — ${PASS}%.` }),
      E ? h("div", { class: "notice" },
        h("b", { text: "Є незавершена спроба. " }), `Відповіли на ${Object.keys(E.answers).length} із ${E.items.length}. `,
        h("div", { class: "btn-row", style: "margin-top:10px" },
          h("button", { class: "btn primary", type: "button", onclick: () => runExam(E) }, "Продовжити"),
          h("button", { class: "btn danger", type: "button", onclick: async () => { if (await modal("Скасувати спробу?", "Прогрес поточної спроби буде втрачено.", [{ label: "Скасувати", value: true, cls: "danger" }, { label: "Назад", value: false }])) { load().exam = null; save(); renderStart(); } } }, "Скасувати спробу"))) : null,
      h("div", { class: "card" },
        h("div", { class: "opt-row", style: "margin:0 0 16px" }, h("div", null, h("label", { text: "Час" }), seg)),
        h("div", { class: "btn-row" }, h("button", { class: "btn primary", type: "button", onclick: begin }, "Почати іспит"))));
  }
  function begin() {
    const E = { items: compose(), answers: {}, flags: {}, cur: 0, spent: 0, limitSec: limitMin * 60 };
    load().exam = E; save();
    runExam(E);
  }

  /* ---------- іспит ---------- */
  function runExam(E) {
    clear();
    const n = E.items.length;
    const timerEl = h("span", { class: "timer", "aria-live": "off" });
    const body = h("div"), side = h("div");
    const persist = () => { load().exam = E; save(); };

    function tick() {
      E.spent++;
      if (E.spent % 5 === 0) persist();
      paintTimer();
      if (E.limitSec && E.spent >= E.limitSec) { finish(E, true); }
    }
    function paintTimer() {
      if (!E.limitSec) { timerEl.textContent = "⏱ " + fmtTime(E.spent); return; }
      const left = E.limitSec - E.spent;
      timerEl.textContent = "⏳ " + fmtTime(left);
      timerEl.classList.toggle("low", left <= 300);
    }
    function go(i) { E.cur = Math.min(n - 1, Math.max(0, i)); persist(); draw(); }
    function answer(i) { E.answers[E.cur] = i; persist(); draw(); }

    function draw() {
      const it = E.items[E.cur], q = byId[it.id], p = prepare(q, it.order);
      body.replaceChildren(
        h("div", { class: "qtop" },
          h("span", { class: "pill", text: `Питання ${E.cur + 1} з ${n}` }),
          h("button", { class: "btn", type: "button", onclick: () => { E.flags[E.cur] ? delete E.flags[E.cur] : (E.flags[E.cur] = 1); persist(); draw(); } }, E.flags[E.cur] ? "⚑ Знято позначку" : "⚐ Позначити")),
        h("div", { class: "qtext", text: q.q }),
        questionCard(p, { selected: E.answers[E.cur] }, answer),
        h("div", { class: "btn-row", style: "margin-top:18px" },
          h("button", { class: "btn", type: "button", disabled: E.cur === 0, onclick: () => go(E.cur - 1) }, "← Назад"),
          h("button", { class: "btn", type: "button", disabled: E.cur === n - 1, onclick: () => go(E.cur + 1) }, "Далі →"),
          E.answers[E.cur] !== undefined ? h("button", { class: "btn", type: "button", onclick: () => { delete E.answers[E.cur]; persist(); draw(); } }, "Скинути відповідь") : null));
      side.replaceChildren(
        h("div", { class: "grid", style: "gap:12px" },
          h("div", { class: "navgrid" }, E.items.map((_, i) =>
            h("button", { type: "button", class: [E.answers[i] !== undefined ? "done" : "", E.flags[i] ? "flag" : "", i === E.cur ? "cur" : ""].join(" "), "aria-label": `Питання ${i + 1}`, onclick: () => go(i) }, i + 1))),
          h("div", { class: "legend" }, h("span", { text: `Відповіді: ${Object.keys(E.answers).length}/${n}` }), h("span", { text: `Позначено: ${Object.keys(E.flags).length}` })),
          h("button", { class: "btn primary", type: "button", onclick: confirmFinish }, "Завершити іспит")));
    }
    async function confirmFinish() {
      const left = n - Object.keys(E.answers).length;
      const ok = await modal("Завершити іспит?", left ? `Без відповіді залишилось ${left} питань — вони зарахуються як неправильні.` : "Ви відповіли на всі питання.", [{ label: "Завершити", value: true, cls: "primary" }, { label: "Продовжити", value: false }]);
      if (ok) finish(E, false);
    }

    app.replaceChildren(
      h("div", { class: "qtop" }, h("h1", { style: "margin:0;font-size:24px", text: "ЄДКІ симулятор" }), timerEl),
      h("div", { class: "progress" }, h("i", { id: "pg" })),
      h("div", { class: "exam-layout" }, h("div", { class: "card" }, body), h("div", { class: "card sticky-side" }, side)));
    const pg = app.querySelector("#pg");
    const origDraw = draw;
    draw = function () { origDraw(); pg.style.width = pct(Object.keys(E.answers).length, n) + "%"; };
    draw(); paintTimer();
    timerId = setInterval(tick, 1000);
    keyHandler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector(".modal-back")) return;
      const k = e.key.toLowerCase();
      let idx = "1234".indexOf(k); if (idx < 0) idx = ["а", "б", "в", "г"].indexOf(k);
      if (idx >= 0) answer(idx);
      else if (e.key === "ArrowRight") go(E.cur + 1);
      else if (e.key === "ArrowLeft") go(E.cur - 1);
    };
    document.addEventListener("keydown", keyHandler);
  }

  /* ---------- підсумок ---------- */
  function finish(E, timeUp) {
    clear();
    const n = E.items.length;
    const byTopic = {}, rows = [], wrong = [];
    let correct = 0;
    E.items.forEach((it, i) => {
      const q = byId[it.id], p = prepare(q, it.order), a = E.answers[i];
      const ok = a !== undefined && p.opts[a].ok;
      const bt = (byTopic[q.t] = byTopic[q.t] || [0, 0]);
      bt[1]++;
      if (ok) { correct++; bt[0]++; }
      else wrong.push(q.id);
      if (a !== undefined) record(q.id, ok);
      rows.push({ q, p, a, ok });
    });
    const res = { ts: Date.now(), total: n, correct, pct: pct(correct, n), duration: E.spent, byTopic, wrong };
    const S = load();
    S.history.unshift(res); S.history = S.history.slice(0, 100);
    S.exam = null; save();
    if (res.pct >= 60) { EDKI.addCoins(25); EDKI.toast("Симулятор складено: +25 🪙"); }
    renderResult(res, rows, timeUp);
  }

  function renderResult(res, rows, timeUp) {
    clear();
    const pass = res.pct >= PASS;
    let onlyWrong = true;
    const list = h("div");
    const drawList = () => {
      list.replaceChildren(...rows.map((r, i) => ({ r, i })).filter((x) => !onlyWrong || !x.r.ok).map(({ r, i }) =>
        h("div", { class: "review-item" },
          h("span", { class: "pill", text: `${i + 1}. ${topicName[r.q.t]}` }),
          h("div", { class: "q", text: r.q.q }),
          r.a === undefined ? h("div", { class: "ans none", text: "Ви не відповіли" }) : h("div", { class: "ans " + (r.ok ? "ok" : "bad"), text: `Ваша відповідь (${LETTERS[r.a]}): ${r.p.opts[r.a].text}` }),
          r.ok ? null : h("div", { class: "ans ok", text: (() => { const k = r.p.opts.findIndex((o) => o.ok); return `Правильна відповідь (${LETTERS[k]}): ${r.p.opts[k].text}`; })() }),
          h("div", { class: "btn-row", style: "margin-top:8px" }, EDKI.markButton(r.q.id), EDKI.copyButton(() => EDKI.aiPrompt(r.p, r.a))))));
      if (!list.children.length) list.append(h("p", { class: "muted", text: "Помилок немає — чудовий результат!" }));
    };
    const tog = h("div", { class: "seg" });
    const drawTog = () => tog.replaceChildren(...[[true, "Лише помилки"], [false, "Усі питання"]].map(([v, l]) =>
      h("button", { type: "button", "aria-pressed": String(onlyWrong === v), onclick: () => { onlyWrong = v; drawTog(); drawList(); } }, l)));
    drawTog(); drawList();

    app.replaceChildren(
      h("h1", { text: "Результат іспиту" }),
      timeUp ? h("div", { class: "notice", text: "Час вичерпано — іспит завершено автоматично." }) : null,
      h("div", { class: "card" }, h("div", { class: "score" },
        h("div", { class: "ring", style: `--p:${res.pct};--ringc:${pass ? "var(--ok)" : "var(--bad)"}` }, h("span", { text: res.pct + "%" })),
        h("div", null,
          h("span", { class: "verdict " + (pass ? "ok" : "bad"), text: pass ? "Склав(ла)" : "Не склав(ла)" }),
          h("p", { style: "margin:8px 0 0", text: `Правильно: ${res.correct} із ${res.total}. Час: ${fmtTime(res.duration)}.` }),
          h("p", { class: "muted small", style: "margin:4px 0 0", text: `Умовний поріг: ${PASS}%.` })))),
      h("h2", { text: "За темами" }),
      h("div", { class: "card" }, h("table", null,
        h("thead", null, h("tr", null, h("th", { text: "Тема" }), h("th", { class: "num", text: "Правильно" }), h("th", { class: "num", text: "%" }))),
        h("tbody", null, TOPICS.filter((t) => res.byTopic[t.key]).map((t) => { const [c, tot] = res.byTopic[t.key]; return h("tr", null, h("td", { text: t.name }), h("td", { class: "num", text: `${c}/${tot}` }), h("td", { class: "num", text: pct(c, tot) + "%" })); })))),
      h("div", { class: "btn-row", style: "margin:20px 0" },
        h("button", { class: "btn primary", type: "button", onclick: renderStart }, "Нова спроба"),
        h("a", { class: "btn", href: "topics.html?mode=errors", style: "text-decoration:none" }, "Відпрацювати помилки")),
      h("h2", { text: "Розбір" }), tog, h("div", { class: "card", style: "margin-top:12px" }, list));
    window.scrollTo(0, 0);
    if (pass) EDKI.confetti();
  }

  renderStart();
})();
