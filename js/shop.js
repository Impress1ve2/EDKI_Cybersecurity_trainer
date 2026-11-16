(function () {
  const { h, load, save, pct, ITEMS, MILESTONES, itemById, buy, equip, claim, streak, toast, music, topicIcon } = EDKI;
  const app = document.getElementById("app");
  const TABS = [["theme", "🎨 Теми"], ["badge", "🏅 Значки"], ["track", "🎧 Музика"]];
  let tab = "theme";

  function itemCard(it) {
    const S = load(), owned = !!S.owned[it.id], on = S.equipped[it.type] === it.id;
    const preview = it.type === "theme"
      ? h("span", { class: "pv sw", style: `background:${it.color}` }, it.emoji)
      : h("span", { class: "pv", text: it.emoji });
    let btn;
    if (on) btn = h("button", { class: "btn", type: "button", disabled: true }, "✓ Вибрано");
    else if (owned) btn = h("button", { class: "btn primary", type: "button", onclick: () => { equip(it.id); render(); } }, "Обрати");
    else if (it.lock) btn = h("button", { class: "btn", type: "button", disabled: true }, `🔒 Серія ${it.lock} днів`);
    else btn = h("button", { class: "btn", type: "button", disabled: (S.coins || 0) < it.price,
      title: (S.coins || 0) < it.price ? `Не вистачає ${it.price - (S.coins || 0)} монет` : "",
      onclick: () => { if (buy(it.id)) { toast(`Куплено: ${it.name}`); equip(it.id); render(); } } }, `Купити · 🪙 ${it.price}`);
    return h("div", { class: "card item" + (on ? " on" : "") }, preview, h("b", { text: it.name }), h("span", { class: "muted small", text: it.desc }), h("div", { class: "grow" }), btn);
  }

  function playerCard() {
    const S = load(), cur = itemById(S.equipped.track);
    const vol = h("input", { type: "range", min: 0, max: 1, step: 0.01, value: music.volume, "aria-label": "Гучність", oninput: (e) => music.setVolume(+e.target.value) });
    const btn = h("button", { class: "btn primary", type: "button", onclick: () => { music.toggle(); paint(); } });
    const paint = () => (btn.textContent = music.on ? "❚❚ Пауза" : "▶ Увімкнути");
    paint();
    window.addEventListener("edki:music", paint);
    return h("div", { class: "card player" },
      h("span", { class: "pv", text: cur.emoji }),
      h("div", { style: "flex:1;min-width:150px" }, h("b", { text: cur.name }), h("div", { class: "muted small", text: "Фонова музика для навчання. Кільце в шапці — таймер помодоро на 25 хв." })),
      h("div", { class: "btn-row" }, btn, h("label", { class: "vol" }, "🔊", vol)));
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
      h("p", { class: "lead", text: "Витрачайте монети, зароблені навчанням, на оформлення сайту та музику. Нагороди за серію днів відкривають ексклюзиви." }),
      h("div", { class: "card wallet" },
        h("div", null, h("span", { class: "muted small", text: "Ваш баланс" }), h("b", { class: "big", text: "🪙 " + (S.coins || 0) })),
        h("div", { class: "rules" },
          h("span", { class: "pill", text: "+1 за правильну відповідь" }), h("span", { class: "pill", text: "+10 за ціль дня" }),
          h("span", { class: "pill", text: "+25 за склавши симулятор" }),
          h("span", { class: "pill", text: `🔥 серія: ${streak()} (рекорд ${best})` }))),
      h("h2", { text: "Нагороди за серію" }),
      h("div", { class: "grid cols-4" }, ms),
      h("h2", { text: "Крамниця" }),
      h("div", { style: "margin-bottom:14px" }, seg),
      tab === "track" ? playerCard() : null,
      h("div", { class: "grid cols-3", style: "margin-top:14px" }, ITEMS.filter((i) => i.type === tab).map(itemCard)),
      h("p", { class: "footer", text: "Покупки зберігаються в цьому браузері й входять в експорт на сторінці «Статистика»." }));
  }
  render();
  window.addEventListener("edki:coins", () => {}); // баланс у шапці оновлюється автоматично
})();
