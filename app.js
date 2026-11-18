(() => {
  const CFG = window.NOVA_CONFIG;
  const CART_KEY = "nova_cart_v1";
  const $ = (s) => document.querySelector(s);

  let products = [];
  let byCode = new Map();
  const state = { q: "", cat: null, brand: null, origin: null, showAllBrands: false };
  let cart = load();

  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: CFG.currency, maximumFractionDigits: 0 });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const norm = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const hasPrice = (p) => typeof p.price === "number" && p.price > 0;

  function load() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; }
  }
  function save() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  }

  fetch("products.json")
    .then((r) => r.json())
    .then((data) => {
      products = data.map((p) => ({ ...p, brandLabel: titleCase(p.brand), search: norm(`${p.brand} ${p.name} ${p.origin} ${p.category}`) }));
      byCode = new Map(products.map((p) => [p.code, p]));
      for (const code of Object.keys(cart)) if (!byCode.has(code)) delete cart[code];
      renderFilters();
      renderGrid();
      renderCart();
    });

  function countBy(list, key) {
    const m = new Map();
    for (const p of list) if (p[key]) m.set(p[key], (m.get(p[key]) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function filtered() {
    const q = norm(state.q.trim());
    return products.filter((p) =>
      (!state.cat || p.category === state.cat) &&
      (!state.brand || p.brand === state.brand) &&
      (!state.origin || p.origin === state.origin) &&
      (!q || q.split(/\s+/).every((t) => p.search.includes(t)))
    );
  }

  function chip(label, count, active, attr, value) {
    return `<button class="chip" aria-pressed="${active}" data-${attr}="${esc(value)}"><span>${esc(label)}</span><small>${count}</small></button>`;
  }

  function renderFilters() {
    $("#catBar").innerHTML =
      `<button class="cat" data-cat="" aria-pressed="${!state.cat}">Todo</button>` +
      countBy(products, "category").map(([c]) => `<button class="cat" data-cat="${esc(c)}" aria-pressed="${c === state.cat}">${esc(c)}</button>`).join("");
    const brands = countBy(products, "brand");
    const shown = state.showAllBrands ? brands : brands.slice(0, 12);
    if (state.brand && !shown.some(([b]) => b === state.brand)) shown.push(brands.find(([b]) => b === state.brand));
    $("#brandList").innerHTML =
      shown.map(([b, n]) => chip(titleCase(b), n, b === state.brand, "brand", b)).join("") +
      (brands.length > 12 ? `<button class="chip-more" id="moreBrands">${state.showAllBrands ? "Ver menos" : `Ver todas (${brands.length})`}</button>` : "");
    $("#originList").innerHTML = countBy(products, "origin").map(([o, n]) => chip(o, n, o === state.origin, "origin", o)).join("");
    $("#clearFilters").hidden = !(state.cat || state.brand || state.origin || state.q);
  }

  function controls(p) {
    const q = cart[p.code] || 0;
    if (!q) return `<button class="add-btn" data-add="${esc(p.code)}">Agregar</button>`;
    return `<div class="qty"><button data-dec="${esc(p.code)}" aria-label="Quitar uno">−</button><span>${q}</span><button data-inc="${esc(p.code)}" aria-label="Agregar uno">+</button></div>`;
  }

  function priceHtml(p) {
    return hasPrice(p) ? `<span class="price">${money.format(p.price)}</span>` : `<span class="price pending">Consultar</span>`;
  }

  function media(p, cls = "") {
    return p.img ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" class="${cls}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'NOVA'}))">` : `<span class="ph">NOVA</span>`;
  }

  function renderGrid() {
    const list = filtered();
    $("#resultCount").textContent = `${list.length} producto${list.length === 1 ? "" : "s"}`;
    $("#grid").innerHTML = list.length
      ? list.map((p) => `
        <article class="card" data-code="${esc(p.code)}">
          <div class="card-media">${media(p)}</div>
          <div class="card-body">
            <span class="card-brand">${esc(p.brandLabel)}</span>
            <h3 class="card-name">${esc(p.name)}</h3>
            <span class="card-origin">${esc(p.origin)}</span>
            <div class="card-foot">${priceHtml(p)}<span class="ctl">${controls(p)}</span></div>
          </div>
        </article>`).join("")
      : `<div class="empty"><strong>Sin resultados</strong>Probá con otra búsqueda o limpiá los filtros.</div>`;
  }

  function refreshCard(code) {
    const el = document.querySelector(`.card[data-code="${CSS.escape(code)}"] .ctl`);
    if (el) el.innerHTML = controls(byCode.get(code));
  }

  function setQty(code, q) {
    if (q <= 0) delete cart[code]; else cart[code] = q;
    save();
    refreshCard(code);
    renderCart();
  }

  function cartLines() {
    return Object.entries(cart).map(([code, qty]) => ({ p: byCode.get(code), qty })).filter((l) => l.p);
  }

  function renderCart() {
    const lines = cartLines();
    const units = lines.reduce((s, l) => s + l.qty, 0);
    const count = $("#cartCount");
    count.textContent = units;
    count.toggleAttribute("data-zero", units === 0);

    $("#cartItems").innerHTML = lines.length
      ? lines.map(({ p, qty }) => `
        <div class="line">
          ${media(p)}
          <div>
            <div class="line-name">${esc(p.name)}</div>
            <div class="line-meta">${esc(p.brandLabel)} · ${hasPrice(p) ? money.format(p.price) + " c/u" : "Precio a confirmar"}</div>
          </div>
          <div class="line-right">
            <div class="qty"><button data-dec="${esc(p.code)}" aria-label="Quitar uno">−</button><span>${qty}</span><button data-inc="${esc(p.code)}" aria-label="Agregar uno">+</button></div>
            ${hasPrice(p) ? `<span class="line-sub">${money.format(p.price * qty)}</span>` : ""}
          </div>
        </div>`).join("")
      : `<div class="cart-empty"><strong>Tu pedido está vacío</strong>Agregá productos para empezar.</div>`;

    const priced = lines.filter((l) => hasPrice(l.p));
    const total = priced.reduce((s, l) => s + l.p.price * l.qty, 0);
    const pending = lines.length - priced.length;
    $("#totalLabel").textContent = pending && priced.length ? "Subtotal" : "Total";
    $("#cartTotal").textContent =priced.length ? money.format(total) : "A confirmar";
    $("#totalNote").textContent = pending && priced.length ? `${pending} producto${pending > 1 ? "s" : ""} con precio a confirmar.` : pending ? "Te confirmamos el total por WhatsApp." : "";
    $("#checkout").disabled = !lines.length;
  }

  function orderNumber() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${CFG.orderPrefix}-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${rand}`;
  }

  function checkout() {
    const lines = cartLines();
    if (!lines.length) return;
    const id = orderNumber();
    const priced = lines.filter((l) => hasPrice(l.p));
    const total = priced.reduce((s, l) => s + l.p.price * l.qty, 0);
    const msg = [
      `Hola NOVA! Quiero confirmar mi pedido *${id}*`,
      "",
      ...lines.map(({ p, qty }) => `• ${qty} x ${p.name}${hasPrice(p) ? ` — ${money.format(p.price * qty)}` : ""} (${p.code})`),
      "",
      priced.length === lines.length ? `*Total: ${money.format(total)}*` : priced.length ? `Subtotal: ${money.format(total)} (+ productos a confirmar)` : "Total a confirmar",
    ].join("\n");
    window.open(`https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    cart = {};
    save();
    renderGrid();
    renderCart();
    closeCart();
    toast(`Pedido ${id} enviado a WhatsApp`);
  }

  const drawer = $("#drawer"), overlay = $("#overlay");
  function openCart() {
    overlay.hidden = false;
    requestAnimationFrame(() => { overlay.classList.add("show"); drawer.classList.add("open"); });
    drawer.setAttribute("aria-hidden", "false");
  }
  function closeCart() {
    overlay.classList.remove("show");
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    setTimeout(() => { overlay.hidden = true; }, 250);
  }

  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.add) {
      setQty(d.add, 1);
      const cb = $("#openCart");
      cb.classList.remove("bump"); void cb.offsetWidth; cb.classList.add("bump");
    } else if (d.inc) setQty(d.inc, (cart[d.inc] || 0) + 1);
    else if (d.dec) setQty(d.dec, (cart[d.dec] || 0) - 1);
    else if (d.cat !== undefined) { state.cat = d.cat || null; renderFilters(); renderGrid(); }
    else if (d.brand !== undefined) { state.brand = state.brand === d.brand ? null : d.brand; renderFilters(); renderGrid(); }
    else if (d.origin !== undefined) { state.origin = state.origin === d.origin ? null : d.origin; renderFilters(); renderGrid(); }
    else if (b.id === "moreBrands") { state.showAllBrands = !state.showAllBrands; renderFilters(); }
  });

  let qTimer;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value; renderFilters(); renderGrid(); }, 120);
  });
  $("#clearFilters").addEventListener("click", () => {
    Object.assign(state, { q: "", cat: null, brand: null, origin: null });
    $("#q").value = "";
    renderFilters();
    renderGrid();
  });
  $("#openCart").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);
  $("#checkout").addEventListener("click", checkout);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCart(); });
})();
