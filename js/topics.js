(function () {
  const { h, Q, TOPICS, load, save, record, shuffle, prepare, questionCard, pct, LETTERS } = EDKI;
  const app = document.getElementById("app");
  const params = new URLSearchParams(location.search);
  let mode = ["smart", "all", "new", "errors", "marks"].includes(params.get("mode")) ? params.get("mode") : "smart";
  let order = "random";
  let limit = 0;
  let keyHandler = null;

  const stats = () => load().stats;
  const isWrongNow = (id) => { const r = stats()[id]; return r && r.w > 0 && !r.ok; };

  // «Розумний добір»: пріоритет — недавні помилки, нові питання та давно не повторювані
  function priority(q) {
    const r = stats()[q.id];
    if (!r) return 1.5 + Math.random() * 0.6;
    const days = Math.min(14, (Date.now() - (r.last || 0)) / 864e5);
    return (r.ok ? 0 : 3) + (r.w / (r.c + r.w)) * 2 + days / 14 + Math.random() * 0.6;
  }
  function poolFor(key) {
    let qs = key === "all" ? Q : Q.filter((q) => q.t === key);
    if (mode === "new") qs = qs.filter((q) => !stats()[q.id]);
    if (mode === "errors") qs = qs.filter((q) => isWrongNow(q.id));
    if (mode === "marks") qs = qs.filter((q) => EDKI.isMarked(q.id));
    if (mode === "smart") return shuffle(qs.slice().sort((a, b) => priority(b) - priority(a)).slice(0, limit || 20));
    qs = order === "random" ? shuffle(qs) : qs.slice();
    return limit ? qs.slice(0, limit) : qs;
  }

  /* ---------- вибір теми ---------- */
  function renderSelect() {
    cleanup();
    app.replaceChildren();
    const seg = (items, cur, set) => h("div", { class: "seg" }, items.map(([v, l]) =>
      h("button", { type: "button", "aria-pressed": String(cur === v), onclick: () => { set(v); renderSelect(); } }, l)));
    const card = (key, name) => {
      const qs = key === "all" ? Q : Q.filter((q) => q.t === key);
      const s = stats();
      let ok = 0, bad = 0;
      qs.forEach((q) => { const r = s[q.id]; if (r) (r.ok ? ok++ : bad++); });
      const avail = poolFor(key).length;
      return h("button", { class: "card topic", type: "button", disabled: !avail, onclick: () => start(key, name), style: avail ? null : "opacity:.5;cursor:not-allowed" },
        h("h3", null, EDKI.topicIcon(key) + " " + name),
        h("div", { class: "bar", "aria-hidden": "true" }, h("i", { class: "g", style: `width:${pct(ok, qs.length)}%` }), h("i", { class: "r", style: `width:${pct(bad, qs.length)}%` })),
        h("div", { class: "meta" }, h("span", { text: `${qs.length} питань` }), h("span", { text: avail ? `доступно: ${avail}` : "немає питань у цьому режимі" })));
    };
    app.append(
      h("h1", { text: "Тренажер за темами" }),
      h("p", { class: "lead", text: "«Розумний добір» сам підбирає 20 питань: помилки, нові та давно не повторювані. Оберіть тему — після кожної відповіді одразу видно, чи вона правильна. Зелена смужка — відповіді, які ви востаннє дали правильно, червона — з помилкою." }),
      h("div", { class: "opt-row" },
        h("div", null, h("label", { text: "Які питання" }), seg([["smart", "Розумний добір"], ["all", "Усі"], ["new", "Нові"], ["errors", "Мої помилки"], ["marks", "★ Закладки"]], mode, (v) => (mode = v))),
        h("div", null, h("label", { text: "Порядок" }), seg([["random", "Випадковий"], ["list", "За списком"]], order, (v) => (order = v))),
        h("div", null, h("label", { text: "Скільки питань" }), seg([[0, "Усі"], [10, "10"], [20, "20"], [50, "50"]], limit, (v) => (limit = v)))),
      h("div", { class: "grid cols-2" }, card("all", "Усі теми (мікс)"), TOPICS.map((t) => card(t.key, t.name))));
  }

  /* ---------- сесія ---------- */
  function start(key, name) {
    const pool = poolFor(key);
    if (!pool.length) return;
    run({ name, pool, i: 0, correct: 0, wrong: 0, sel: null, reveal: false, prep: null });
  }
  function cleanup() { if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; } }

  function run(S) {
    cleanup();
    if (S.i >= S.pool.length) return renderDone(S);
    const q = S.pool[S.i];
    S.prep = S.prep || prepare(q);
    S.sel = null; S.reveal = false;
    const holder = h("div");
    const fb = h("div");
    const nextBtn = h("button", { class: "btn primary", type: "button", disabled: true, onclick: next }, S.i + 1 === S.pool.length ? "Завершити ↵" : "Далі ↵");

    function pick(i) {
      if (S.reveal) return;
      S.sel = i; S.reveal = true;
      const ok = S.prep.opts[i].ok;
      record(q.id, ok); save();
      ok ? S.correct++ : S.wrong++;
      draw();
    }
    function draw() {
      holder.replaceChildren(questionCard(S.prep, { selected: S.sel, reveal: S.reveal }, pick));
      fb.replaceChildren();
      if (S.reveal) {
        const ok = S.prep.opts[S.sel].ok;
        const right = LETTERS[S.prep.opts.findIndex((o) => o.ok)];
        fb.append(h("div", { class: "feedback " + (ok ? "ok" : "bad"), text: ok ? "Правильно!" : `Неправильно. Правильна відповідь: ${right}` }));
        fb.append(h("div", { class: "btn-row", style: "margin-top:12px" }, EDKI.copyButton(() => EDKI.aiPrompt(S.prep, S.sel)),
          h("span", { class: "muted small", text: "Вставте у ChatGPT, Claude, Gemini тощо, щоб отримати пояснення." })));
        nextBtn.disabled = false; nextBtn.focus();
      }
    }
    function next() {
      if (!S.reveal) return;
      S.i++; S.prep = null; run(S);
    }

    app.replaceChildren(
      h("div", { class: "qtop" },
        h("span", { class: "pill", text: S.name }),
        h("div", { class: "btn-row" }, h("span", { class: "muted small", text: `Питання ${S.i + 1} з ${S.pool.length} · ✓ ${S.correct} · ✗ ${S.wrong}` }), EDKI.markButton(q.id))),
      h("div", { class: "progress" }, h("i", { style: `width:${pct(S.i, S.pool.length)}%` })),
      h("div", { class: "card" }, h("div", { class: "qtext", text: q.q }), holder, fb,
        h("div", { class: "btn-row", style: "margin-top:18px" }, nextBtn,
          h("button", { class: "btn", type: "button", onclick: () => renderDone(S) }, "Закінчити тут"),
          h("span", { class: "muted small" }, "Клавіші: ", h("kbd", { text: "1–4" }), " або ", h("kbd", { text: "А Б В Г" }), ", ", h("kbd", { text: "Enter" })))));
    draw();

    keyHandler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "enter") { if (S.reveal) { e.preventDefault(); next(); } return; }
      let idx = "1234".indexOf(k);
      if (idx < 0) idx = ["а", "б", "в", "г"].indexOf(k);
      if (idx >= 0) pick(idx);
    };
    document.addEventListener("keydown", keyHandler);
  }

  function renderDone(S) {
    cleanup();
    const total = S.correct + S.wrong;
    app.replaceChildren(
      h("h1", { text: "Сесію завершено" }),
      h("p", { class: "lead", text: S.name }),
      h("div", { class: "grid cols-3" },
        h("div", { class: "card stat" }, h("b", { text: total }), h("span", { text: "відповідей" })),
        h("div", { class: "card stat" }, h("b", { text: S.correct }), h("span", { text: "правильно" })),
        h("div", { class: "card stat" }, h("b", { text: total ? pct(S.correct, total) + "%" : "—" }), h("span", { text: "точність" }))),
      h("div", { class: "btn-row", style: "margin-top:20px" },
        h("button", { class: "btn primary", type: "button", onclick: renderSelect }, "До списку тем"),
        S.wrong ? h("button", { class: "btn", type: "button", onclick: () => { mode = "errors"; renderSelect(); } }, "Повторити помилки") : null));
  }

  const tp = params.get("topic");
  const tt = tp === "all" ? "Усі теми (мікс)" : (TOPICS.find((x) => x.key === tp) || {}).name;
  if (tt && poolFor(tp).length) start(tp, tt); else renderSelect();
})();
