(function () {
  const { h, Q, TOPICS, load, save, pct, topicIcon, todayKey, streak, mastery } = EDKI;
  const app = document.getElementById("app");

  /* Динамічний текст: літери по черзі «спадають» і нове слово «падає» на місце на пружині. */
  function dynamicText(words, hold) {
    const el = h("span", { class: "dyn", "aria-hidden": "true" });
    let i = 0;
    const letters = (w) => [...w].map((ch) => h("span", { class: "ch" }, ch === " " ? " " : ch));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    function animate(spans, cfg, frame, gap) {
      spans.forEach((sp, n) => {
        const s = EDKI.createSpring(0, cfg, (p) => frame(sp, p)); s.snap(0);
        setTimeout(() => s.target(1), n * gap);
      });
    }
    async function show(first) {
      const old = el.offsetWidth;
      const spans = letters(words[i]);
      el.style.width = "auto"; el.replaceChildren(...spans);
      const w = el.offsetWidth;
      if (EDKI.reduceMotion()) { el.style.width = ""; return; }
      el.style.width = (first ? w : old) + "px"; void el.offsetWidth; el.style.width = w + "px";
      animate(spans, { k: 230, c: 15 }, (sp, p) => {
        sp.style.transform = `translateY(${(1 - p) * -0.55}em) scale(${0.6 + 0.4 * p})`;
        sp.style.opacity = Math.min(1, Math.max(0, p * 1.5));
      }, 32);
      await wait(spans.length * 32 + 450);
    }
    async function loop() {
      await show(true);
      for (;;) {
        await wait(hold);
        if (document.hidden) continue;
        const spans = [...el.children];
        if (!EDKI.reduceMotion()) {
          animate(spans, { k: 320, c: 30 }, (sp, q) => { sp.style.transform = `translateY(${q * 0.5}em)`; sp.style.opacity = Math.max(0, 1 - q * 1.2); }, 14);
          await wait(spans.length * 14 + 220);
        }
        i = (i + 1) % words.length;
        await show(false);
      }
    }
    setTimeout(loop, 0);
    return el;
  }
  const dyn = dynamicText(["по темах", "з таймером", "над помилками", "без інтернету", "щодня"], 2600);

  const ring = (p, label, color) =>
    h("div", { class: "ring sm", style: `--p:${p};--ringc:${color || "var(--accent)"}` }, h("span", { text: label }));
  const stat = (v, l) => h("div", { class: "card stat" }, h("b", { text: v }), h("span", { text: l }));
  const mode = (href, tag, title, text) =>
    h("a", { class: "card mode-card", href }, h("span", { class: "tag", text: tag }), h("h3", { text: title }), h("p", { text: text }));

  function render() {
    const st = load();
    const goal = st.goal || 20, today = st.activity[todayKey()] || 0, days = streak();
    let c = 0, w = 0;
    Object.values(st.stats).forEach((r) => { c += r.c; w += r.w; });
    const answered = Object.keys(st.stats).length;
    const best = st.history.reduce((m, x) => Math.max(m, x.pct), 0);

    // готовність = частка питань, на які востаннє відповіли правильно
    const rows = TOPICS.map((t) => {
      const qs = Q.filter((q) => q.t === t.key);
      const seen = qs.filter((q) => st.stats[q.id]).length;
      return { t, n: qs.length, seen, m: mastery(qs) };
    });
    const ready = Math.round((100 * rows.reduce((s, r) => s + r.m * r.n, 0)) / Q.length);
    const weak = rows.filter((r) => r.seen > 0).sort((a, b) => a.m - b.m)[0];

    // календар активності: останні 28 днів
    const cells = [];
    for (let k = 27; k >= 0; k--) {
      const d = new Date(); d.setDate(d.getDate() - k);
      const n = st.activity[todayKey(d)] || 0;
      const lvl = n === 0 ? 0 : n < goal / 2 ? 1 : n < goal ? 2 : 3;
      cells.push(h("i", { class: "hm l" + lvl, title: `${d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}: ${n} відповідей` }));
    }

    const goalSeg = h("div", { class: "seg" }, [10, 20, 50].map((g) =>
      h("button", { type: "button", "aria-pressed": String(goal === g), onclick: () => { load().goal = g; save(); render(); } }, String(g))));

    app.replaceChildren(
      h("section", { class: "hero" },
        h("h1", { "aria-label": "Підготовка до ЄДКІ з кібербезпеки: по темах, з таймером, над помилками, без інтернету, щодня" }, "Підготовка до ЄДКІ", h("br"), dyn),
        h("p", { class: "lead", text: "Локальний тренажер без інтернету та акаунтів. Варіанти відповідей перемішуються щоразу, тож довжина тексту не підкаже правильну відповідь — доведеться знати матеріал." }),
        h("div", { class: "btn-row" },
          h("a", { class: "btn primary", href: "topics.html?mode=smart&topic=all", style: "text-decoration:none" }, "Розумне повторення →"),
          h("a", { class: "btn", href: "exam.html", style: "text-decoration:none" }, "Пройти симулятор"))),

      h("div", { class: "grid cols-3 dash" },
        h("div", { class: "card dash-card" },
          h("div", { class: "dash-head" }, h("b", { text: "Ціль на сьогодні" }), h("span", { class: "streak", title: "Днів поспіль із практикою", text: "🔥 " + days })),
          h("div", { class: "dash-body" }, ring(Math.min(100, pct(today, goal)), `${today}/${goal}`, today >= goal ? "var(--ok)" : "var(--accent)"),
            h("div", null, h("p", { class: "muted small", style: "margin:0 0 8px", text: today >= goal ? "Ціль виконано — чудова робота!" : `Ще ${goal - today} відповідей до цілі` }), goalSeg))),
        h("div", { class: "card dash-card" },
          h("div", { class: "dash-head" }, h("b", { text: "Готовність" })),
          h("div", { class: "dash-body" }, ring(ready, ready + "%", ready >= 60 ? "var(--ok)" : "var(--accent)"),
            h("p", { class: "muted small", style: "margin:0", text: "Частка питань, на які ви востаннє відповіли правильно." }))),
        h("div", { class: "card dash-card" },
          h("div", { class: "dash-head" }, h("b", { text: "Рекомендація" })),
          weak && weak.m < 0.9
            ? h("div", null, h("p", { style: "margin:0 0 10px" }, "Слабка тема: ", h("b", { text: topicIcon(weak.t.key) + " " + weak.t.name })),
                h("a", { class: "btn primary", href: `topics.html?mode=smart&topic=${weak.t.key}`, style: "text-decoration:none;display:inline-block" }, "Потренувати"))
            : h("p", { class: "muted", style: "margin:0", text: answered ? "Слабких тем немає — спробуйте симулятор." : "Почніть із розумного повторення — воно підбере питання за вас." }))),

      h("h2", { text: "Активність за 4 тижні" }),
      h("div", { class: "card" }, h("div", { class: "heat" }, cells),
        h("p", { class: "muted small", style: "margin:12px 0 0", text: "Чим темніша клітинка, тим більше відповідей за день. Повна — ціль виконано." })),

      h("div", { class: "grid cols-4", style: "margin-top:14px" },
        stat(Q.length, "питань у базі"), stat(answered, "питань опрацьовано"),
        stat(c + w ? pct(c, c + w) + "%" : "—", "точність відповідей"), stat(st.history.length ? best + "%" : "—", "найкращий результат симулятора")),

      h("h2", { text: "Режими" }),
      h("div", { class: "grid cols-4" },
        mode("topics.html?mode=smart&topic=all", "Розумно", "Розумне повторення", "20 питань: помилки, нові та давно не повторювані."),
        mode("topics.html", "Практика", "Тренажер за темами", "Миттєва перевірка, закладки та помилки."),
        mode("exam.html", "Іспит", "ЄДКІ симулятор", "100 питань, таймер, розбір після завершення."),
        mode("stats.html", "Аналітика", "Статистика", "Прогрес за темами, історія спроб, експорт."),
        mode("shop.html", "Нагороди", "Магазин", "Монети за відповіді та 🔥 серію: теми, значки, фони, заморозка.")),

      h("h2", { text: "Теми" }),
      h("div", { class: "card tlist" }, rows.map((r) =>
        h("a", { class: "trow", href: `topics.html?mode=smart&topic=${r.t.key}` },
          h("span", { class: "ti", text: topicIcon(r.t.key) }),
          h("span", { class: "tn" }, h("b", { text: r.t.name }), h("span", { class: "bar" }, h("i", { class: "g", style: `width:${Math.round(r.m * 100)}%` }))),
          h("span", { class: "tp muted small", text: `${Math.round(r.m * 100)}% · ${r.n}` })))),
      h("p", { class: "footer", text: "Прогрес зберігається лише в цьому браузері (localStorage). Для перенесення на інший пристрій — розділ «Статистика»." }));
  }
  render();
})();
