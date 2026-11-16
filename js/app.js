/* Спільний код: сховище, тема, навігація, допоміжні функції.
   Усе працює локально, дані прогресу зберігаються у localStorage браузера. */
(function () {
  const LETTERS = ["А", "Б", "В", "Г"];
  const KEY = "edki.trainer.v1";
  const Q = window.QUESTIONS || [];
  const TOPICS = window.TOPICS || [];
  const byId = Object.fromEntries(Q.map((q) => [q.id, q]));
  const topicName = Object.fromEntries(TOPICS.map((t) => [t.key, t.name]));

  /* ---------- сховище ---------- */
  const fresh = () => ({ stats: {}, history: [], theme: "auto", exam: null, marks: {}, activity: {}, goal: 20 });
  let mem = null;
  function load() {
    if (mem) return mem;
    try {
      const raw = localStorage.getItem(KEY);
      mem = Object.assign(fresh(), raw ? JSON.parse(raw) : {});
    } catch (e) { mem = fresh(); }
    return mem;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(load())); } catch (e) { /* приватний режим тощо */ }
  }
  function record(qid, ok) {
    const s = load().stats;
    const r = s[qid] || { c: 0, w: 0 };
    ok ? r.c++ : r.w++;
    r.last = Date.now();
    r.ok = ok ? 1 : 0; // результат останньої спроби
    s[qid] = r;
    const act = load().activity, day = todayKey(); act[day] = (act[day] || 0) + 1;
  }
  function replaceState(obj) { mem = Object.assign(fresh(), obj); save(); }

  /* ---------- утиліти ---------- */
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      e.append(c.nodeType ? c : document.createTextNode(c));
    });
    return e;
  }
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    const hh = Math.floor(m / 60);
    const pad = (n) => String(n).padStart(2, "0");
    return hh ? `${hh}:${pad(m % 60)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function fmtDate(ts) {
    return new Date(ts).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  /* Підготовка питання: перемішуємо варіанти (правильний у даних завжди перший). */
  function prepare(q, order) {
    order = order || shuffle([0, 1, 2, 3]);
    return { id: q.id, t: q.t, q: q.q, order, opts: order.map((i) => ({ text: q.a[i], ok: i === 0 })) };
  }

  /* Картка питання. state: {selected, reveal}. onPick(index) */
  function questionCard(p, state, onPick) {
    const wrap = h("div", { class: "opts", role: "group", "aria-label": "Варіанти відповіді" });
    p.opts.forEach((o, i) => {
      let cls = "opt";
      if (state.reveal) {
        if (o.ok) cls += " ok";
        else if (state.selected === i) cls += " bad";
        else cls += " dim";
      } else if (state.selected === i) cls += " sel";
      const b = h("button", { class: cls, type: "button", disabled: !!state.locked || !!state.reveal, "data-i": i, onclick: () => onPick(i) },
        h("span", { class: "ltr" }, LETTERS[i]), h("span", { class: "txt" }, o.text));
      wrap.append(b);
    });
    return wrap;
  }

  /* ---------- пружина ---------- */
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Пружина «маса–пружина–демпфер»: k — жорсткість, c — затухання (менше c = більше пружності).
  function createSpring(x0, cfg, onUpdate) {
    const k = (cfg && cfg.k) || 220, c = (cfg && cfg.c) || 18;
    let x = x0, t = x0, v = 0, raf = 0, last = 0;
    function step(now) {
      const dt = Math.min(0.032, (now - (last || now)) / 1000 || 0.016); last = now;
      const n = Math.ceil(dt / 0.008), dh = dt / n;
      for (let i = 0; i < n; i++) { v += (-k * (x - t) - c * v) * dh; x += v * dh; }
      if (Math.abs(v) < 0.005 && Math.abs(x - t) < 0.0005) { x = t; v = 0; raf = 0; last = 0; onUpdate(x); return; }
      onUpdate(x);
      raf = requestAnimationFrame(step);
    }
    const run = () => { if (!raf) raf = requestAnimationFrame(step); };
    return {
      target(n) { t = n; if (reduceMotion()) { x = n; v = 0; onUpdate(x); return; } run(); },
      snap(n) { x = t = n; v = 0; onUpdate(x); },
      kick(vel) { if (!reduceMotion()) { v += vel; run(); } },
      get value() { return x; },
    };
  }

  /* ---------- тема ---------- */
  function applyTheme() {
    const t = load().theme;
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  function isDark() {
    const t = load().theme;
    return t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  const s = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  /* Шнурок: потягніть вниз і відпустіть (або натисніть / Enter) — змінюється тема. */
  function buildCord() {
    const REST = 30, MAX = 64, TRIGGER = 22;
    const line = s("line", { x1: 14, y1: 0, x2: 14, y2: REST, class: "cord-line" });
    const knob = s("circle", { cx: 14, cy: REST, r: 11, class: "cord-knob" });
    const icon = s("text", { x: 14, y: REST, class: "cord-icon", "text-anchor": "middle", "dominant-baseline": "central" });
    const grip = s("g", { class: "cord-grip" }); grip.append(knob, icon);
    const svg = s("svg", { class: "cord-svg", width: 28, height: 160, viewBox: "0 0 28 160" }); svg.append(line, grip);
    const root = h("div", { class: "cord", role: "switch", tabindex: "0", "aria-label": "Темна тема" }, svg);

    const sp = createSpring(0, { k: 210, c: 9 }, (y) => {
      const cy = REST + y;
      line.setAttribute("y2", cy); knob.setAttribute("cy", cy); icon.setAttribute("y", cy + 0.5);
    });
    const paint = () => { root.setAttribute("aria-checked", String(isDark())); icon.textContent = isDark() ? "☾" : "☀"; };
    const toggle = () => { load().theme = isDark() ? "light" : "dark"; save(); applyTheme(); paint(); };
    paint();

    let startY = null, moved = 0;
    grip.addEventListener("pointerdown", (e) => { startY = e.clientY; moved = 0; grip.setPointerCapture(e.pointerId); e.preventDefault(); });
    grip.addEventListener("pointermove", (e) => {
      if (startY === null) return;
      const dy = e.clientY - startY; moved = Math.max(moved, Math.abs(dy));
      sp.snap(dy <= 0 ? 0 : MAX * Math.tanh(dy / MAX)); // гумовий опір
    });
    const release = () => {
      if (startY === null) return;
      const pulled = sp.value;
      startY = null;
      if (pulled > TRIGGER || moved < 4) { toggle(); if (moved < 4) sp.kick(260); }
      sp.target(0);
    };
    grip.addEventListener("pointerup", release);
    grip.addEventListener("pointercancel", release);
    root.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); sp.kick(320); sp.target(0); } });
    return root;
  }

  /* Goo-меню: пункти «витікають» із кнопки, зливаючись у краплі. */
  function buildGooMenu(page) {
    const items = [["index.html", "Головна", "home"], ["topics.html", "Тренажер за темами", "topics"], ["exam.html", "ЄДКІ симулятор", "exam"], ["stats.html", "Статистика", "stats"]];
    const W0 = 112, W1 = 216, H = 40, STEP = 54, PAD = 24;
    const filter = s("svg", { width: 0, height: 0, style: "position:absolute", "aria-hidden": "true" });
    const f = s("filter", { id: "goo", x: "-20%", y: "-20%", width: "140%", height: "140%", "color-interpolation-filters": "sRGB" });
    f.append(s("feGaussianBlur", { in: "SourceGraphic", stdDeviation: 7, result: "b" }),
             s("feColorMatrix", { in: "b", mode: "matrix", values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" }));
    const defs = s("defs", {}); defs.append(f); filter.append(defs);

    const blobs = h("div", { class: "goo-blobs", "aria-hidden": "true" });
    const mkBlob = () => h("span", { class: "blob" });
    const base = mkBlob(); blobs.append(base);
    const itemBlobs = items.map(mkBlob); blobs.append(...itemBlobs);

    const bars = h("span", { class: "burger", "aria-hidden": "true" }, h("i"), h("i"));
    const trigger = h("button", { class: "goo-trigger", type: "button", "aria-expanded": "false", "aria-controls": "goo-links" }, bars, h("span", { text: "Меню" }));
    const links = items.map(([href, label, key]) => h("a", Object.assign({ href, tabindex: "-1" }, key === page ? { "aria-current": "page" } : {}), label));
    const nav = h("nav", { class: "goo-links", id: "goo-links", "aria-label": "Розділи", inert: true }, links);
    const root = h("div", { class: "goo" }, filter, blobs, nav, trigger);

    const place = (el, y, w) => { el.style.transform = `translate(${PAD}px, ${PAD + y}px)`; el.style.width = w + "px"; };
    place(base, 0, W0);
    const springs = items.map((_, i) => createSpring(0, { k: 230, c: 16 }, (p) => {
      const y = p * STEP * (i + 1), w = W0 + (W1 - W0) * Math.max(0, p);
      place(itemBlobs[i], y, w);
      place(links[i], y, w);
      links[i].style.opacity = Math.min(1, Math.max(0, (p - 0.45) / 0.55));
    }));
    springs.forEach((sp) => sp.snap(0));
    let open = false, timers = [];
    function set(next) {
      open = next;
      trigger.setAttribute("aria-expanded", String(open));
      root.classList.toggle("open", open);
      nav.inert = !open;
      links.forEach((a) => (a.tabIndex = open ? 0 : -1));
      timers.forEach(clearTimeout);
      timers = springs.map((sp, i) => setTimeout(() => sp.target(open ? 1 : 0), (open ? i : items.length - 1 - i) * 55));
    }
    trigger.addEventListener("click", () => set(!open));
    document.addEventListener("pointerdown", (e) => { if (open && !root.contains(e.target)) set(false); });
    document.addEventListener("keydown", (e) => { if (open && e.key === "Escape") { set(false); trigger.focus(); } });
    return root;
  }

  function buildHeader() {
    const page = document.body.dataset.page;
    const slot = h("div", { class: "cord-slot" }, buildCord());
    const header = h("header", { class: "site-header" },
      h("div", { class: "wrap" },
        h("a", { class: "brand", href: "index.html" }, h("i", { text: "Є" }), h("span", { text: "ЄДКІ · Кібербезпека" })),
        buildGooMenu(page),
        h("div", { style: "flex:1" }), slot));
    document.body.prepend(header);
  }

  /* ---------- серія, закладки, готовність ---------- */
  function todayKey(d) {
    d = d || new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }
  function streak() {
    const a = load().activity, d = new Date();
    if (!(a[todayKey(d)] > 0)) d.setDate(d.getDate() - 1);
    let n = 0;
    while (a[todayKey(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  const isMarked = (id) => !!load().marks[id];
  function toggleMark(id) { const m = load().marks; m[id] ? delete m[id] : (m[id] = 1); save(); }
  // частка питань, на які востаннє відповіли правильно
  function mastery(qs) {
    const s = load().stats;
    return qs.length ? qs.filter((q) => s[q.id] && s[q.id].ok).length / qs.length : 0;
  }
  const ICONS = { all: "🎯", tzi: "📡", crypto: "🔐", kszi: "🛡️", net: "🌐", netsec: "🧱", os: "🖥️", swsec: "🐞", inc: "🚨", risk: "⚖️", law: "📜" };
  const topicIcon = (k) => ICONS[k] || "📘";

  function markButton(id) {
    const star = h("span", { class: "star" });
    const lbl = h("span");
    const btn = h("button", { class: "btn mark-btn", type: "button" }, star, lbl);
    const sp = createSpring(1, { k: 300, c: 11 }, (v) => (star.style.transform = `scale(${v}) rotate(${(v - 1) * 50}deg)`));
    const paint = () => {
      const on = isMarked(id);
      btn.setAttribute("aria-pressed", String(on));
      star.textContent = on ? "★" : "☆"; lbl.textContent = on ? "У закладках" : "У закладки";
    };
    btn.addEventListener("click", () => { toggleMark(id); paint(); sp.snap(0.5); sp.target(1); });
    paint();
    return btn;
  }

  function confetti() {
    if (reduceMotion()) return;
    const cols = ["#2457d6", "#17803d", "#f0a95a", "#c0362c", "#6c93ff"];
    const box = h("div", { class: "confetti", "aria-hidden": "true" });
    for (let i = 0; i < 70; i++) {
      box.append(h("i", { style: `left:${Math.random() * 100}%;background:${cols[i % 5]};animation-delay:${Math.random() * 0.6}s;animation-duration:${2 + Math.random() * 1.6}s;--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720}deg` }));
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 4200);
  }

  /* ---------- запит для ШІ ---------- */
  function aiPrompt(p, sel) {
    const L = LETTERS, right = p.opts.findIndex((o) => o.ok);
    const mine = sel === undefined ? null : sel;
    const wrong = mine !== null && mine !== right;
    const lines = [
      "Ти — досвідчений викладач з кібербезпеки й технічного захисту інформації. Допоможи мені підготуватися до державного іспиту ЄДКІ (Україна): поясни питання з тесту простими словами.",
      "",
      "Тема: " + (topicName[p.t] || p.t),
      "Питання: " + p.q,
      "Варіанти відповіді:",
      ...p.opts.map((o, i) => `${L[i]}) ${o.text}`),
      "",
      `Правильна відповідь за ключем: ${L[right]}) ${p.opts[right].text}`,
      mine === null ? "Моя відповідь: я не встиг(ла) відповісти." : wrong ? `Моя відповідь: ${L[mine]}) ${p.opts[mine].text} — це НЕПРАВИЛЬНО.` : "Моя відповідь була правильною, але я хочу краще зрозуміти тему.",
      "",
      "Будь ласка:",
      "1. Поясни, чому правильна відповідь саме така (2–4 речення, ключова ідея).",
      ...(wrong ? ["2. Поясни, чому моя відповідь не підходить і в чому типова хибна логіка, яка могла до неї привести."] : []),
      `${wrong ? 3 : 2}. Коротко поясни, чому кожен із решти варіантів не підходить.`,
      `${wrong ? 4 : 3}. Дай один простий спосіб запам'ятати це (асоціація, схема чи правило).`,
      `${wrong ? 5 : 4}. Якщо питання пов'язане з нормативними документами (НД ТЗІ, ДСТУ, закони України, стандарти ISO/NIST), назви їх. Якщо не впевнений(а) в номері чи точному формулюванні — прямо скажи про це і не вигадуй.`,
      "",
      "Відповідай українською, структуровано й без води.",
    ];
    return lines.join("\n");
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* запасний варіант нижче */ }
    try {
      const ta = h("textarea", { style: "position:fixed;opacity:0;top:0" }); ta.value = text;
      document.body.append(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (e) { return false; }
  }

  /* Кнопка копіювання: іконка «пружинить», галочка домальовується, напис змінюється. */
  function copyButton(getText, label) {
    label = label || "Копіювати запит для ШІ";
    const clip = s("g", { class: "ic ic-clip" });
    clip.append(s("rect", { x: 8, y: 3, width: 8, height: 4, rx: 1.5 }), s("path", { d: "M16 5h1.5A2.5 2.5 0 0 1 20 7.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-11A2.5 2.5 0 0 1 6.5 5H8" }));
    const check = s("path", { class: "ic ic-check", d: "M5 12.5l4.5 4.5L19 7.5", pathLength: 1 });
    const svg = s("svg", { viewBox: "0 0 24 24", width: 18, height: 18, class: "copy-ic", "aria-hidden": "true" });
    svg.append(clip, check);
    const text = h("span", { class: "copy-label", text: label });
    const btn = h("button", { class: "btn copy-btn", type: "button" }, svg, text);
    const pop = createSpring(1, { k: 320, c: 13 }, (v) => (svg.style.transform = `scale(${v})`));
    let timer = 0;
    btn.addEventListener("click", async () => {
      const ok = await copyText(getText());
      clearTimeout(timer);
      btn.classList.toggle("done", ok); btn.classList.toggle("fail", !ok);
      text.textContent = ok ? "Скопійовано — вставте в ШІ" : "Не вдалося скопіювати";
      pop.snap(0.55); pop.target(1);
      timer = setTimeout(() => { btn.classList.remove("done", "fail"); text.textContent = label; }, 2200);
    });
    return btn;
  }

  function modal(title, text, buttons) {
    return new Promise((resolve) => {
      const close = (v) => { back.remove(); resolve(v); };
      const back = h("div", { class: "modal-back", onclick: (e) => e.target === back && close(null) },
        h("div", { class: "card modal", role: "dialog", "aria-modal": "true" },
          h("h3", { text: title }), h("p", { class: "muted", text: text }),
          h("div", { class: "btn-row" }, buttons.map((b) => h("button", { class: "btn " + (b.cls || ""), type: "button", onclick: () => close(b.value) }, b.label)))));
      document.body.append(back);
      back.querySelector("button").focus();
    });
  }

  applyTheme();
  document.addEventListener("DOMContentLoaded", buildHeader);

  window.EDKI = { LETTERS, Q, TOPICS, byId, topicName, load, save, record, replaceState, shuffle, h, pct, fmtTime, fmtDate, prepare, questionCard, modal, createSpring, reduceMotion, aiPrompt, copyButton, todayKey, streak, isMarked, toggleMark, mastery, topicIcon, markButton, confetti, KEY };
})();
