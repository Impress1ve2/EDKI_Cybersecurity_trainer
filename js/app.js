/* Спільний код: сховище, тема, навігація, допоміжні функції.
   Усе працює локально, дані прогресу зберігаються у localStorage браузера. */
(function () {
  // replaceChildren не ігнорує null/false — відсікаємо їх, щоб не друкувалося слово «null»
  const _rc = Element.prototype.replaceChildren;
  Element.prototype.replaceChildren = function (...a) { return _rc.apply(this, a.flat(Infinity).filter((x) => x != null && x !== false)); };
  const LETTERS = ["А", "Б", "В", "Г"];
  const KEY = "edki.trainer.v1";
  const Q = window.QUESTIONS || [];
  const TOPICS = window.TOPICS || [];
  const byId = Object.fromEntries(Q.map((q) => [q.id, q]));
  const topicName = Object.fromEntries(TOPICS.map((t) => [t.key, t.name]));

  /* ---------- сховище ---------- */
  const fresh = () => ({ stats: {}, history: [], theme: "auto", exam: null, marks: {}, activity: {}, goal: 20,
    coins: 0, earned: 0, owned: { classic: 1, seed: 1, none: 1 }, equipped: { theme: "classic", badge: "seed", bg: "none" },
    claimed: {}, bestStreak: 0, goalPaid: "", freezes: 0, frozen: {}, focus: null, focusDone: 0 });
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
    const S0 = load(), sk = streak();
    if (sk > (S0.bestStreak || 0)) S0.bestStreak = sk;
    if (ok) addCoins(1);
    if (act[day] === (S0.goal || 20) && S0.goalPaid !== day) { S0.goalPaid = day; addCoins(10); toast("Ціль дня виконано: +10 🪙"); }
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
    const bg = load().equipped.bg;
    if (bg && bg !== "none") document.documentElement.setAttribute("data-bg", bg); else document.documentElement.removeAttribute("data-bg");
    const acc = itemById(load().equipped.theme);
    if (acc && acc.id !== "classic") { document.documentElement.setAttribute("data-accent", acc.id); document.documentElement.style.setProperty("--a", acc.color); }
    else { document.documentElement.removeAttribute("data-accent"); document.documentElement.style.removeProperty("--a"); }
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
    const items = [["index.html", "Головна", "home"], ["topics.html", "Тренажер за темами", "topics"], ["exam.html", "ЄДКІ симулятор", "exam"], ["stats.html", "Статистика", "stats"], ["shop.html", "Магазин", "shop"]];
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
    const badge = itemById(load().equipped.badge);
    const header = h("header", { class: "site-header" },
      h("div", { class: "wrap" },
        h("a", { class: "brand", href: "index.html" }, h("i", { text: "Є" }), h("span", { text: "ЄДКІ · Кібербезпека" })),
        buildGooMenu(page),
        h("div", { style: "flex:1" }),
        badge && badge.id !== "seed" ? h("span", { class: "hbadge", title: "Значок: " + badge.name, text: badge.emoji }) : null,
        buildCoinChip(), buildFocusTimer(), slot));
    document.body.prepend(header);
    checkFocus(); applyFreeze();
  }

  /* ---------- серія, закладки, готовність ---------- */
  function todayKey(d) {
    d = d || new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }
  function streak() {
    const S = load(), a = S.activity, fr = S.frozen || {}, d = new Date();
    const ok = (k) => a[k] > 0 || fr[k];
    if (!ok(todayKey(d))) d.setDate(d.getDate() - 1);
    let n = 0;
    while (ok(todayKey(d))) { if (a[todayKey(d)] > 0) n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  // «Заморозка серії»: якщо вчора був пропуск, а позавчора — активність, витрачаємо заморозку
  function applyFreeze() {
    const S = load(); S.frozen = S.frozen || {};
    const y = new Date(); y.setDate(y.getDate() - 1);
    const b = new Date(y); b.setDate(b.getDate() - 1);
    const ky = todayKey(y), kb = todayKey(b);
    if ((S.freezes || 0) <= 0 || S.activity[ky] > 0 || S.frozen[ky]) return;
    if (!(S.activity[kb] > 0 || S.frozen[kb])) return;
    S.freezes--; S.frozen[ky] = 1; save();
    toast("🧊 Заморозка врятувала вашу серію!");
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

  /* ---------- магазин: каталог, монети, нагороди ---------- */
  const ITEMS = [
    { id: "classic", type: "theme", name: "Класична", desc: "Синій акцент за замовчуванням", price: 0, color: "#2457d6", emoji: "🎨" },
    { id: "ocean", type: "theme", name: "Океан", desc: "Спокійний бірюзовий", price: 40, color: "#0e7490", emoji: "🌊" },
    { id: "forest", type: "theme", name: "Ліс", desc: "Зелений для концентрації", price: 40, color: "#2f855a", emoji: "🌲" },
    { id: "sunset", type: "theme", name: "Захід сонця", desc: "Теплий помаранчевий", price: 60, color: "#c2410c", emoji: "🌇" },
    { id: "grape", type: "theme", name: "Виноград", desc: "Глибокий фіолетовий", price: 60, color: "#7c3aed", emoji: "🍇" },
    { id: "gold", type: "theme", name: "Золото", desc: "Ексклюзив за серію 7 днів", lock: 7, color: "#b7791f", emoji: "🏆" },
    { id: "seed", type: "badge", name: "Новачок", desc: "Кожен експерт колись починав", price: 0, emoji: "🌱" },
    { id: "fox", type: "badge", name: "Хитрий лис", desc: "Бачить фішинг за кілометр", price: 30, emoji: "🦊" },
    { id: "detective", type: "badge", name: "Детектив", desc: "Розслідує інциденти", price: 40, emoji: "🕵️" },
    { id: "shield", type: "badge", name: "Захисник", desc: "Тримає периметр", price: 50, emoji: "🛡️" },
    { id: "brain", type: "badge", name: "Мозок", desc: "Знає ДСТУ напам'ять", price: 80, emoji: "🧠" },
    { id: "legend", type: "badge", name: "Легенда", desc: "Ексклюзив за серію 30 днів", lock: 30, emoji: "👑" },
    { id: "none", type: "bg", name: "Чистий", desc: "Класичний фон без візерунка", price: 0, emoji: "⬜" },
    { id: "grid", type: "bg", name: "Сітка", desc: "Тонка зошитова сітка", price: 50, emoji: "▦" },
    { id: "dots", type: "bg", name: "Крапки", desc: "М'який крапчастий візерунок", price: 50, emoji: "∷" },
    { id: "aurora", type: "bg", name: "Аврора", desc: "Переливи кольорів у кутах", price: 80, emoji: "🌌" },
    { id: "matrix", type: "bg", name: "Матриця", desc: "Ексклюзив за серію 14 днів", lock: 14, emoji: "🟩" },
    { id: "freeze", type: "boost", name: "Заморозка серії", desc: "Автоматично рятує серію, якщо пропустити один день (до 3 шт.)", price: 40, emoji: "🧊" },
  ];
  const MILESTONES = [
    { id: "m3", days: 3, coins: 20, item: null },
    { id: "m7", days: 7, coins: 50, item: "gold" },
    { id: "m14", days: 14, coins: 100, item: "matrix" },
    { id: "m30", days: 30, coins: 250, item: "legend" },
  ];
  const itemById = (id) => ITEMS.find((i) => i.id === id);

  function toast(text) {
    const t = h("div", { class: "toast", role: "status", text });
    document.body.append(t);
    setTimeout(() => t.classList.add("out"), 2400);
    setTimeout(() => t.remove(), 2900);
  }
  function addCoins(n) {
    const S = load();
    S.coins = (S.coins || 0) + n; S.earned = (S.earned || 0) + n;
    save();
    window.dispatchEvent(new CustomEvent("edki:coins", { detail: n }));
  }
  function buy(id) {
    const S = load(), it = itemById(id);
    if (it && it.type === "boost") {
      if ((S.freezes || 0) >= 3 || (S.coins || 0) < it.price) return false;
      S.coins -= it.price; S.freezes = (S.freezes || 0) + 1; save();
      window.dispatchEvent(new CustomEvent("edki:coins", { detail: 0 }));
      return true;
    }
    if (!it || S.owned[id] || it.lock || (S.coins || 0) < it.price) return false;
    S.coins -= it.price; S.owned[id] = 1; save();
    window.dispatchEvent(new CustomEvent("edki:coins", { detail: 0 }));
    return true;
  }
  function equip(id) {
    const S = load(), it = itemById(id);
    if (!it || !S.owned[id]) return;
    S.equipped[it.type] = id; save();
    if (it.type === "theme" || it.type === "bg") applyTheme();
    window.dispatchEvent(new CustomEvent("edki:equip"));
  }
  function claim(id) {
    const S = load(), m = MILESTONES.find((x) => x.id === id);
    if (!m || S.claimed[id] || (S.bestStreak || 0) < m.days) return false;
    S.claimed[id] = 1; if (m.item) S.owned[m.item] = 1; save();
    addCoins(m.coins);
    return true;
  }

  /* ---------- таймер фокусу (помодоро) ----------
     Рахується за часом завершення, тому не зупиняється при переході між сторінками чи вкладками. */
  const FOCUS_MIN = 25, FOCUS_REWARD = 15;
  function checkFocus() {
    const S = load(), f = S.focus;
    if (!f || Date.now() < f.end) return false;
    S.focus = null; S.focusDone = (S.focusDone || 0) + 1; save();
    addCoins(FOCUS_REWARD);
    toast(`Сесію фокусу завершено: +${FOCUS_REWARD} 🪙. Відпочиньте 5 хвилин ☕`);
    window.dispatchEvent(new CustomEvent("edki:focus"));
    return true;
  }
  function buildFocusTimer() {
    const R = 15, CIRC = 2 * Math.PI * R;
    const ring = s("circle", { cx: 18, cy: 18, r: R, class: "fr-ring", "stroke-dasharray": CIRC, "stroke-dashoffset": CIRC });
    const track = s("circle", { cx: 18, cy: 18, r: R, class: "fr-track" });
    const svg = s("svg", { viewBox: "0 0 36 36", class: "fr-svg", "aria-hidden": "true" }); svg.append(track, ring);
    const label = h("span", { class: "fl" });
    const btn = h("button", { class: "focus-btn", type: "button" }, h("span", { class: "fr" }, svg, h("span", { class: "fi", text: "⏱" })), label);
    const paint = () => {
      const f = load().focus;
      btn.classList.toggle("on", !!f);
      if (f) {
        const left = Math.max(0, f.end - Date.now());
        ring.setAttribute("stroke-dashoffset", String(CIRC * (left / f.dur)));
        label.textContent = fmtTime(left / 1000);
        btn.title = "Фокус-сесія триває. Натисніть, щоб скасувати"; btn.setAttribute("aria-label", "Скасувати сесію фокусу, залишилось " + fmtTime(left / 1000));
      } else {
        ring.setAttribute("stroke-dashoffset", String(CIRC)); label.textContent = "Фокус";
        btn.title = `Запустити таймер фокусу на ${FOCUS_MIN} хв (+${FOCUS_REWARD} 🪙 за завершення)`; btn.setAttribute("aria-label", `Запустити таймер фокусу на ${FOCUS_MIN} хвилин`);
      }
    };
    btn.addEventListener("click", async () => {
      const S = load();
      if (!S.focus) {
        S.focus = { end: Date.now() + FOCUS_MIN * 60000, dur: FOCUS_MIN * 60000 }; save();
        toast(`Фокус ${FOCUS_MIN} хв розпочато. Не відволікайтеся!`);
      } else if (await modal("Скасувати сесію?", `Нагороду +${FOCUS_REWARD} 🪙 буде втрачено.`, [{ label: "Скасувати сесію", value: true, cls: "danger" }, { label: "Продовжити", value: false }])) {
        S.focus = null; save();
      }
      paint();
    });
    setInterval(() => { checkFocus(); paint(); }, 1000);
    window.addEventListener("edki:focus", paint);
    paint();
    return btn;
  }

  /* Лічильник монет у шапці */
  function buildCoinChip() {
    const num = h("span", { class: "n" });
    const a = h("a", { class: "coin-chip", href: "shop.html", title: "Магазин" }, h("span", { class: "c", text: "🪙" }), num);
    const sp = createSpring(1, { k: 320, c: 12 }, (v) => (a.style.transform = `scale(${v})`));
    const paint = () => (num.textContent = load().coins || 0);
    window.addEventListener("edki:coins", (e) => {
      paint();
      if (e.detail > 0) {
        sp.snap(1.25); sp.target(1);
        const f = h("span", { class: "plus", text: "+" + e.detail });
        a.append(f); setTimeout(() => f.remove(), 1100);
      }
    });
    paint();
    return a;
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

  window.EDKI = { LETTERS, Q, TOPICS, byId, topicName, load, save, record, replaceState, shuffle, h, pct, fmtTime, fmtDate, prepare, questionCard, modal, createSpring, reduceMotion, aiPrompt, copyButton, todayKey, streak, isMarked, toggleMark, mastery, topicIcon, markButton, confetti, ITEMS, MILESTONES, itemById, addCoins, buy, equip, claim, toast, KEY };
})();
