(function () {
  const { h, Q, TOPICS, byId, topicName, load, save, replaceState, pct, fmtTime, fmtDate, modal, KEY } = EDKI;
  const app = document.getElementById("app");

  function render() {
    const st = load();
    let c = 0, w = 0;
    Object.values(st.stats).forEach((r) => { c += r.c; w += r.w; });
    const stat = (v, l) => h("div", { class: "card stat" }, h("b", { text: v }), h("span", { text: l }));

    const topicRows = TOPICS.map((t) => {
      const qs = Q.filter((q) => q.t === t.key);
      let cc = 0, ww = 0, seen = 0;
      qs.forEach((q) => { const r = st.stats[q.id]; if (r) { seen++; cc += r.c; ww += r.w; } });
      return h("tr", null, h("td", { text: t.name }), h("td", { class: "num", text: `${seen}/${qs.length}` }),
        h("td", { class: "num", text: cc + ww ? pct(cc, cc + ww) + "%" : "—" }),
        h("td", { style: "width:120px" }, h("div", { class: "bar" }, h("i", { class: "g", style: `width:${pct(cc, cc + ww)}%` }), h("i", { class: "r", style: `width:${cc + ww ? 100 - pct(cc, cc + ww) : 0}%` }))));
    });

    const hard = Object.entries(st.stats).filter(([, r]) => r.w > 0).sort((a, b) => b[1].w - a[1].w || a[1].c - b[1].c).slice(0, 15)
      .map(([id, r]) => byId[id] && h("tr", null, h("td", { text: byId[id].q }), h("td", { class: "num", text: `${r.w} / ${r.c + r.w}` })));

    const hist = st.history.map((x) => h("tr", null, h("td", { text: fmtDate(x.ts) }), h("td", { class: "num", text: `${x.correct}/${x.total}` }),
      h("td", { class: "num" }, h("span", { class: "verdict " + (x.pct >= 60 ? "ok" : "bad"), text: x.pct + "%" })), h("td", { class: "num", text: fmtTime(x.duration) })));

    const fileInput = h("input", { type: "file", accept: "application/json", class: "hidden", onchange: onImport });
    app.replaceChildren(
      h("h1", { text: "Статистика та помилки" }),
      h("div", { class: "grid cols-4", style: "margin-top:20px" },
        stat(Object.keys(st.stats).length + "/" + Q.length, "питань опрацьовано"),
        stat(c + w ? pct(c, c + w) + "%" : "—", "загальна точність"),
        stat(st.history.length, "спроб симулятора"),
        stat(st.history.length ? Math.max(...st.history.map((x) => x.pct)) + "%" : "—", "найкращий результат")),
      h("h2", { text: "За темами" }),
      h("div", { class: "card" }, h("table", null, h("thead", null, h("tr", null, h("th", { text: "Тема" }), h("th", { class: "num", text: "Опрацьовано" }), h("th", { class: "num", text: "Точність" }), h("th"))), h("tbody", null, topicRows))),
      h("div", { class: "btn-row", style: "margin-top:14px" }, h("a", { class: "btn primary", href: "topics.html?mode=errors", style: "text-decoration:none" }, "Тренувати помилки")),
      h("h2", { text: "Найскладніші питання" }),
      h("div", { class: "card" }, hard.length ? h("table", null, h("thead", null, h("tr", null, h("th", { text: "Питання" }), h("th", { class: "num", text: "Помилок" }))), h("tbody", null, hard)) : h("p", { class: "muted", text: "Поки що помилок немає." })),
      h("h2", { text: "Історія симулятора" }),
      h("div", { class: "card" }, hist.length ? h("table", null, h("thead", null, h("tr", null, h("th", { text: "Дата" }), h("th", { class: "num", text: "Результат" }), h("th", { class: "num", text: "%" }), h("th", { class: "num", text: "Час" }))), h("tbody", null, hist)) : h("p", { class: "muted", text: "Ви ще не проходили симулятор." })),
      h("h2", { text: "Дані" }),
      h("div", { class: "card" },
        h("p", { class: "muted", style: "margin-top:0", text: "Прогрес зберігається в браузері. Експортуйте його у файл, щоб перенести на інший пристрій чи зробити копію." }),
        h("div", { class: "btn-row" },
          h("button", { class: "btn", type: "button", onclick: onExport }, "Експортувати"),
          h("button", { class: "btn", type: "button", onclick: () => fileInput.click() }, "Імпортувати"),
          h("button", { class: "btn danger", type: "button", onclick: onReset }, "Скинути прогрес"), fileInput)));
  }

  function onExport() {
    const blob = new Blob([JSON.stringify(load(), null, 1)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: "edki-progress.json" });
    document.body.append(a); a.click(); a.remove();
  }
  function onImport(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || typeof d.stats !== "object") throw 0;
        if (await modal("Імпортувати прогрес?", "Поточний прогрес буде замінено даними з файлу.", [{ label: "Імпортувати", value: true, cls: "primary" }, { label: "Скасувати", value: false }])) { replaceState(d); render(); }
      } catch (err) { modal("Помилка", "Файл не схожий на експорт цього тренажера.", [{ label: "Закрити", value: 1 }]); }
    };
    r.readAsText(f);
  }
  async function onReset() {
    if (await modal("Скинути весь прогрес?", "Статистику та історію буде видалено без можливості відновлення.", [{ label: "Скинути", value: true, cls: "danger" }, { label: "Скасувати", value: false }])) {
      replaceState({}); render();
    }
  }
  render();
})();
