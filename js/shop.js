(function () {
  const { h, load, save, pct, ITEMS, MILESTONES, itemById, buy, equip, claim, streak, toast, topicIcon } = EDKI;
  const app = document.getElementById("app");
  const TABS = [["theme", "🎨 Теми"], ["badge", "🏅 Значки"], ["bg", "🖼️ Фони"], ["boost", "🧊 Бонуси"]];
  let tab = "theme";

  function itemCard(it) {
    const S = load(), owned = !!S.owned[it.id], on = (S.equipped[it.type] || (it.type === "bg" ? "none" : "")) === it.id;
    const preview = it.type === "theme"
      ? h("span", { class: "pv sw", style: `background:${it.color}` }, it.emoji)
      : it.type === "bg" ? h("span", { class: "pv bgp", "data-bg": it.id }, it.emoji)
      : h("span", { class: "pv", text: it.emoji });
    let btn;
    if (it.type === "boost") {
      const n = S.freezes || 0;
      btn = h("button", { class: "btn", type: "button", disabled: n >= 3 || (S.coins || 0) < it.price,
        onclick: () => { if (buy(it.id)) { toast("Заморозку куплено"); render(); } } }, n >= 3 ? "Максимум 3" : `Купити · 🪙 ${it.price}`);
      return h("div", { class: "card item" }, preview, h("b", { text: it.name }), h("span", { class: "muted small", text: it.desc }),
        h("span", { class: "pill", text: `У вас: ${n}` }), h("div", { class: "grow" }), btn);
    }
    if (on) btn = h("button", { class: "btn", type: "button", disabled: true }, "✓ Вибрано");
    else if (owned) btn = h("button", { class: "btn primary", type: "button", onclick: () => { equip(it.id); render(); } }, "Обрати");
    else if (it.lock) btn = h("button", { class: "btn", type: "button", disabled: true }, `🔒 Серія ${it.lock} днів`);
    else btn = h("button", { class: "btn", type: "button", disabled: (S.coins || 0) < it.price,
      title: (S.coins || 0) < it.price ? `Не вистачає ${it.price - (S.coins || 0)} монет` : "",
      onclick: () => { if (buy(it.id)) { toast(`Куплено: ${it.name}`); equip(it.id); render(); } } }, `Купити · 🪙 ${it.price}`);
    return h("div", { class: "card item" + (on ? " on" : "") }, preview, h("b", { text: it.name }), h("span", { class: "muted small", text: it.desc }), h("div", { class: "grow" }), btn);
  }

  function render() {
    const S = load();
    S.bestStreak = Math.max(S.bestStreak || 0, streak()); save();
    const best = S.bestStreak;
    const ms = MILESTONES.map((m) => {
      const done = !!S.claimed[m.id], ready = !done && best >= m.days, it = m.item && itemById(m.item);
      return h("div", { class: "card ms" + (done ? " done" : ready ? " ready" : "") },
        h("div", { class: "dash-head" }, h("b", { text: `🔥 ${m.days} днів` }), done ? h("span", { class: "verdict ok", text: "Отримано" }) : null),
        h("p", { class: "muted small", style: "margin:6px 0 10px", text: `🪙 ${m.coins}` + (it ? ` + ${it.emoji} ${it.name}` : "") }),
        h("div", { class: "bar" }, h("i", { class: "a", style: `width:${Math.min(100, pct(best, m.days))}%` })),
        h("button", { class: "btn " + (ready ? "primary" : ""), type: "button", style: "margin-top:12px;width:100%", disabled: !ready,
          onclick: () => { if (claim(m.id)) { EDKI.confetti(); toast("Нагороду отримано!"); render(); } } }, done ? "✓" : ready ? "Забрати нагороду" : `Ще ${m.days - best} дн.`));
    });
    const seg = h("div", { class: "seg" }, TABS.map(([k, l]) => h("button", { type: "button", "aria-pressed": String(tab === k), onclick: () => { tab = k; render(); } }, l)));
    app.replaceChildren(
      h("h1", { text: "Магазин" }),
      h("p", { class: "lead", text: "Витрачайте монети, зароблені навчанням, на оформлення сайту та бонуси. Нагороди за серію днів відкривають ексклюзиви." }),
      h("div", { class: "card wallet" },
        h("div", null, h("span", { class: "muted small", text: "Ваш баланс" }), h("b", { class: "big", text: "🪙 " + (S.coins || 0) })),
        h("div", { class: "rules" },
          h("span", { class: "pill", text: "+1 за правильну відповідь" }), h("span", { class: "pill", text: "+10 за ціль дня" }),
          h("span", { class: "pill", text: "+25 за склавши симулятор" }), h("span", { class: "pill", text: "+15 за 25 хв фокусу" }),
          h("span", { class: "pill", text: `🧊 заморозок: ${S.freezes || 0}` }), h("span", { class: "pill", text: `⏱ сесій фокусу: ${S.focusDone || 0}` }),
          h("span", { class: "pill", text: `🔥 серія: ${streak()} (рекорд ${best})` }))),
      h("h2", { text: "Нагороди за серію" }),
      h("div", { class: "grid cols-4" }, ms),
      h("h2", { text: "Крамниця" }),
      h("div", { style: "margin-bottom:14px" }, seg),
      h("div", { class: "grid cols-3", style: "margin-top:14px" }, ITEMS.filter((i) => i.type === tab).map(itemCard)),
      h("p", { class: "footer", text: "Покупки зберігаються в цьому браузері й входять в експорт на сторінці «Статистика»." }));
  }
  render();
  window.addEventListener("edki:coins", () => {}); // баланс у шапці оновлюється автоматично
})();
