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
    coins: 0, earned: 0, owned: { classic: 1, seed: 1, rain: 1 }, equipped: { theme: "classic", badge: "seed", track: "rain" },
    claimed: {}, bestStreak: 0, goalPaid: "", music: { on: false, vol: 0.5 } });
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
        buildCoinChip(), buildMusicToggle(), slot));
    document.body.prepend(header);
    music.armPending();
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
    { id: "rain", type: "track", name: "Тихий дощ", desc: "Білий шум дощу для читання", price: 0, emoji: "🌧️" },
    { id: "lofi", type: "track", name: "Lo-fi вечір", desc: "Теплі акорди та м'який біт", price: 70, emoji: "🎧" },
    { id: "focus", type: "track", name: "Фокус", desc: "Бінауральний тон 6 Гц (у навушниках)", price: 100, emoji: "🎯" },
    { id: "space", type: "track", name: "Космос", desc: "Ексклюзив за серію 14 днів", lock: 14, emoji: "🌌" },
  ];
  const MILESTONES = [
    { id: "m3", days: 3, coins: 20, item: null },
    { id: "m7", days: 7, coins: 50, item: "gold" },
    { id: "m14", days: 14, coins: 100, item: "space" },
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
    if (!it || S.owned[id] || it.lock || (S.coins || 0) < it.price) return false;
    S.coins -= it.price; S.owned[id] = 1; save();
    window.dispatchEvent(new CustomEvent("edki:coins", { detail: 0 }));
    return true;
  }
  function equip(id) {
    const S = load(), it = itemById(id);
    if (!it || !S.owned[id]) return;
    S.equipped[it.type] = id; save();
    if (it.type === "theme") applyTheme();
    if (it.type === "track") music.setTrack(id);
    window.dispatchEvent(new CustomEvent("edki:equip"));
  }
  function claim(id) {
    const S = load(), m = MILESTONES.find((x) => x.id === id);
    if (!m || S.claimed[id] || (S.bestStreak || 0) < m.days) return false;
    S.claimed[id] = 1; if (m.item) S.owned[m.item] = 1; save();
    addCoins(m.coins);
    return true;
  }

  /* ---------- музика (синтезується в браузері, файли не потрібні) ---------- */
  const music = (() => {
    let ctx = null, master = null, revIn = null, bus = null, live = [], timer = 0, playing = false, pending = false, noiseBuf = null, startedAt = 0;
    const cfg = () => { const S = load(); S.music = Object.assign({ on: false, vol: 0.5 }, S.music); return S.music; };
    const emit = () => window.dispatchEvent(new CustomEvent("edki:music"));
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function init() {
      if (ctx) return;
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = cfg().vol; master.connect(ctx.destination);
      const conv = ctx.createConvolver(), len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      conv.buffer = ir; revIn = ctx.createGain(); revIn.gain.value = 0.4; revIn.connect(conv); conv.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 5, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    function noiseSrc(loop) { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = loop; return n; }
    function filt(type, f, q) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
    function gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
    function tone(freq, type, t, dur, att, peak, out, cut) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const lp = filt("lowpass", cut || 4000), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(out); g.connect(revIn);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function burst(t, dur, type, f, peak, out) {
      const n = noiseSrc(false), fl = filt(type, f), g = ctx.createGain();
      g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(fl); fl.connect(g); g.connect(out); n.start(t, Math.random() * 3); n.stop(t + dur + 0.02);
    }
    function kick(t, out) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine";
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3);
    }
    function loopNoise(f, type, vol, out) { const n = noiseSrc(true); n.connect(filt(type, f)); const g = gain(vol); n.disconnect(); n.connect(filt(type, f)).connect(g).connect(out); n.start(); live.push(n); }

    const TRACKS = {
      rain(out) {
        const n = noiseSrc(true), bp = filt("bandpass", 1400, 0.4), g = gain(0.6);
        n.connect(bp); bp.connect(g); g.connect(out); n.start(); live.push(n);
        loopNoise(260, "lowpass", 0.5, out);
      },
      lofi(out) {
        const chords = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]], pent = [72, 74, 76, 79, 81, 84];
        let step = 0, next = ctx.currentTime + 0.1;
        loopNoise(3500, "highpass", 0.025, out);
        const tick = () => {
          while (next < ctx.currentTime + 0.6) {
            const k = step % 8, t = next;
            if (k === 0) chords[((step / 8) | 0) % 4].forEach((m) => tone(mf(m), "triangle", t, 3.8, 0.5, 0.09, out, 900));
            if (k === 0 || k === 5) kick(t, out);
            if (k === 2 || k === 6) burst(t, 0.16, "bandpass", 1800, 0.14, out);
            if (k % 2 === 1) burst(t, 0.05, "highpass", 7000, 0.04, out);
            if (Math.random() < 0.35) tone(mf(pent[(Math.random() * pent.length) | 0]), "sine", t + Math.random() * 0.1, 0.9, 0.01, 0.08, out, 3000);
            step++; next += 0.5;
          }
        };
        tick(); timer = setInterval(tick, 200);
      },
      focus(out) {
        [[196, -1], [202, 1]].forEach(([f, pan]) => {
          const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
          const p = ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1); if (p.pan) p.pan.value = pan;
          const g = gain(0.14); o.connect(p); p.connect(g); g.connect(out); o.start(); live.push(o);
        });
        loopNoise(400, "lowpass", 0.12, out);
      },
      space(out) {
        const lp = filt("lowpass", 500), lfo = ctx.createOscillator(), lg = gain(250), g = gain(0.14);
        lfo.frequency.value = 0.07; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); live.push(lfo);
        [110, 164.8, 220.5].forEach((f) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(lp); o.start(); live.push(o); });
        lp.connect(g); g.connect(out); g.connect(revIn);
        const hi = [659, 784, 988, 1175];
        timer = setInterval(() => tone(hi[(Math.random() * hi.length) | 0], "sine", ctx.currentTime, 4, 1, 0.05, out, 3000), 3200);
      },
    };

    function cleanup(fade) {
      clearInterval(timer);
      const old = bus, olive = live; bus = null; live = [];
      if (old) {
        const t = ctx.currentTime; old.gain.cancelScheduledValues(t); old.gain.setValueAtTime(old.gain.value, t); old.gain.linearRampToValueAtTime(0, t + fade);
        setTimeout(() => { olive.forEach((n) => { try { n.stop(); } catch (e) {} }); try { old.disconnect(); } catch (e) {} }, fade * 1000 + 80);
      }
    }
    function start(id) {
      id = id || load().equipped.track;
      init(); if (ctx.state === "suspended") ctx.resume();
      cleanup(0.25);
      bus = ctx.createGain(); bus.gain.setValueAtTime(0, ctx.currentTime); bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.9); bus.connect(master);
      (TRACKS[id] || TRACKS.rain)(bus);
      if (!playing) startedAt = Date.now();
      playing = true; pending = false; cfg().on = true; save(); emit();
    }
    function stop() { if (ctx) cleanup(0.35); playing = false; pending = false; cfg().on = false; save(); emit(); }
    function armPending() {
      if (!cfg().on) return;
      pending = true;
      const go = (e) => {
        removeEventListener("pointerdown", go, true); removeEventListener("keydown", go, true);
        if (e.target && e.target.closest && e.target.closest(".music-toggle")) { pending = false; emit(); return; }
        if (pending) start();
      };
      addEventListener("pointerdown", go, true); addEventListener("keydown", go, true);
    }
    return {
      toggle() { playing ? stop() : start(); },
      start, stop,
      setTrack(id) { if (playing) start(id); else emit(); },
      setVolume(v) { cfg().vol = v; save(); if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
      get volume() { return cfg().vol; },
      get on() { return playing; }, get pending() { return pending; },
      get elapsed() { return playing ? (Date.now() - startedAt) / 1000 : 0; },
      armPending,
    };
  })();

  /* Музичний перемикач: «платівка» зі спінінгом, хвилею, кільцем помодоро (25 хв) та плавним play/pause */
  function buildMusicToggle() {
    const POMO = 25 * 60, R = 19, CIRC = 2 * Math.PI * R;
    const ring = s("circle", { cx: 22, cy: 22, r: R, class: "mt-ring", "stroke-dasharray": CIRC, "stroke-dashoffset": CIRC });
    const track = s("circle", { cx: 22, cy: 22, r: R, class: "mt-track" });
    const svg = s("svg", { viewBox: "0 0 44 44", class: "mt-svg", "aria-hidden": "true" }); svg.append(track, ring);
    const play = h("span", { class: "mt-ic mt-play", text: "▶" }), pause = h("span", { class: "mt-ic mt-pause", text: "❚❚" });
    const disc = h("span", { class: "mt-disc" }, h("span", { class: "mt-art", text: itemById(load().equipped.track).emoji }));
    const wrap = h("span", { class: "mt-wrap" }, svg, disc, play, pause);
    const eq = h("span", { class: "eq", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i"));
    const btn = h("button", { class: "music-toggle", type: "button", "aria-pressed": "false" }, wrap, eq);
    const paint = () => {
      const it = itemById(load().equipped.track);
      btn.classList.toggle("on", music.on); btn.classList.toggle("pending", music.pending);
      btn.setAttribute("aria-pressed", String(music.on));
      btn.setAttribute("aria-label", music.on ? "Вимкнути музику" : "Увімкнути музику");
      btn.title = `${it.name}: ${music.on ? "вимкнути" : music.pending ? "натисніть, щоб відновити" : "увімкнути"}`;
      disc.firstChild.textContent = it.emoji;
    };
    btn.addEventListener("click", () => music.toggle());
    window.addEventListener("edki:music", paint); window.addEventListener("edki:equip", paint);
    setInterval(() => {
      const e = music.elapsed;
      ring.setAttribute("stroke-dashoffset", String(CIRC * (1 - Math.min(1, (e % POMO) / POMO))));
      if (music.on && e >= POMO && !btn._p) { btn._p = 1; toast("25 хвилин навчання! Зробіть перерву на 5 хвилин ☕"); }
      if (e < POMO) btn._p = 0;
    }, 1000);
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

  window.EDKI = { LETTERS, Q, TOPICS, byId, topicName, load, save, record, replaceState, shuffle, h, pct, fmtTime, fmtDate, prepare, questionCard, modal, createSpring, reduceMotion, aiPrompt, copyButton, todayKey, streak, isMarked, toggleMark, mastery, topicIcon, markButton, confetti, ITEMS, MILESTONES, itemById, addCoins, buy, equip, claim, toast, music, KEY };
})();
