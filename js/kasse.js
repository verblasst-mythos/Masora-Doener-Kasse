/* ==========================================================================
   Kasse: Produktauswahl, Warenkorb, Zahlung, Bon
   ========================================================================== */
'use strict';

const Kasse = {
  /* ---------- Rendern ---------- */

  render() {
    this.renderCategories();
    this.renderProducts();
    this.renderCart();
  },

  categories() {
    const seen = [];
    State.products.forEach((p) => {
      if (!seen.includes(p.category)) seen.push(p.category);
    });
    return seen;
  },

  renderCategories() {
    const cats = this.categories();
    if (!State.category || !cats.includes(State.category)) State.category = cats[0] || null;
    const bar = $('#cat-bar');
    bar.innerHTML = cats
      .map(
        (c) =>
          `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === State.category}">${esc(c)}</button>`
      )
      .join('');
  },

  renderProducts() {
    const grid = $('#product-grid');
    const list = State.products.filter((p) => p.category === State.category);
    if (!list.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
        <p>Keine Produkte in dieser Kategorie. Lege welche in der Verwaltung an.</p></div>`;
      return;
    }
    grid.innerHTML = list
      .map(
        (p) => `
      <button class="product" data-add="${p.id}">
        <span class="product-name">${esc(p.name)}</span>
        <span class="product-price">${money(p.price)}</span>
      </button>`
      )
      .join('');
  },

  /* ---------- Warenkorb ---------- */

  add(productId) {
    const p = State.products.find((x) => x.id === productId);
    if (!p) return;
    const line = State.cart.find((l) => l.product_id === p.id);
    if (line) line.qty += 1;
    else
      State.cart.push({
        product_id: p.id,
        name: p.name,
        unit_price: Number(p.price),
        qty: 1,
      });
    this.renderCart();
  },

  changeQty(productId, delta) {
    const line = State.cart.find((l) => l.product_id === productId);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) State.cart = State.cart.filter((l) => l.product_id !== productId);
    this.renderCart();
  },

  removeLine(productId) {
    State.cart = State.cart.filter((l) => l.product_id !== productId);
    this.renderCart();
  },

  clear() {
    State.cart = [];
    State.discountId = '';
    this.renderCart();
  },

  totals() {
    const subtotal = num(State.cart.reduce((s, l) => s + l.unit_price * l.qty, 0));
    const d = State.discounts.find((x) => x.id === State.discountId);
    let discount = 0;
    if (d) {
      discount = d.kind === 'percent' ? num((subtotal * Number(d.value)) / 100) : num(d.value);
      discount = Math.min(discount, subtotal);
    }
    const total = num(subtotal - discount);
    const vatRate = Number(State.settings?.vat_rate ?? 19);
    const vat = num(total - total / (1 + vatRate / 100));
    return { subtotal, discount, total, discountName: d ? d.name : null, vat, vatRate };
  },

  renderCart() {
    const items = $('#cart-items');
    const count = State.cart.reduce((s, l) => s + l.qty, 0);
    $('#cart-count').textContent = count;

    if (!State.cart.length) {
      items.innerHTML = `<div class="empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18l-1.6 11.2A2 2 0 0 1 17.4 19H6.6a2 2 0 0 1-2-1.8L3 6z"/>
          <path d="M8 6V4.5A3.5 3.5 0 0 1 15 4.5V6"/></svg>
        <p>Noch nichts gewählt. Tippe links auf ein Produkt.</p></div>`;
    } else {
      items.innerHTML = State.cart
        .map(
          (l) => `
        <div class="cart-row">
          <div>
            <div class="cart-row-name">${esc(l.name)}</div>
            <div class="cart-row-unit">${money(l.unit_price)} / Stück</div>
          </div>
          <div class="cart-row-total">${money(l.unit_price * l.qty)}</div>
          <div class="qty">
            <button data-minus="${l.product_id}" aria-label="Weniger ${esc(l.name)}">&minus;</button>
            <span class="qty-value">${l.qty}</span>
            <button data-plus="${l.product_id}" aria-label="Mehr ${esc(l.name)}">+</button>
            <span class="spacer"></span>
            <button data-remove="${l.product_id}" aria-label="${esc(l.name)} entfernen">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
            </button>
          </div>
        </div>`
        )
        .join('');
    }

    const sel = $('#discount-select');
    sel.innerHTML =
      `<option value="">Kein Rabatt</option>` +
      State.discounts
        .map(
          (d) =>
            `<option value="${d.id}" ${d.id === State.discountId ? 'selected' : ''}>${esc(d.name)}</option>`
        )
        .join('');

    const t = this.totals();
    $('#sum-subtotal').textContent = money(t.subtotal);
    $('#row-discount').classList.toggle('hidden', t.discount <= 0);
    $('#sum-discount').textContent = '− ' + money(t.discount);
    $('#sum-total').textContent = money(t.total);
    $('#sum-vat').textContent = `${money(t.vat)} (${t.vatRate}%)`;

    const disabled = State.cart.length === 0;
    $('#pay-cash').disabled = disabled;
    $('#pay-card').disabled = disabled;
    $('#cart-clear').disabled = disabled;
  },

  /* ---------- Zahlung ---------- */

  openPayment(method) {
    if (!State.cart.length) return;
    const t = this.totals();
    const isCash = method === 'bar';

    openModal({
      title: isCash ? 'Barzahlung' : 'Kartenzahlung',
      bodyHTML: `
        <div class="pay-total">
          <div class="pay-total-label">Zu zahlen</div>
          <div class="pay-total-value">${money(t.total)}</div>
        </div>
        ${
          isCash
            ? `
        <div class="field">
          <label for="cash-given">Gegeben</label>
          <input class="input" id="cash-given" type="number" step="0.01" min="0"
                 inputmode="decimal" value="${t.total.toFixed(2)}">
        </div>
        <div class="quick-cash" id="quick-cash">
          <button class="btn btn-sm" data-cash="exact">Passend</button>
          <button class="btn btn-sm" data-cash="10">10 €</button>
          <button class="btn btn-sm" data-cash="20">20 €</button>
          <button class="btn btn-sm" data-cash="50">50 €</button>
        </div>
        <div class="change-box" id="change-box">
          <span class="change-label">Rückgeld</span>
          <span class="change-value" id="change-value">${money(0)}</span>
        </div>`
            : `<p class="muted" style="font-size:var(--text-sm)">
                 Betrag am Kartenterminal eingeben und die Zahlung dort abschließen.</p>`
        }`,
      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" id="confirm-pay">Kassieren</button>`,
      onMount: (root) => {
        const confirmBtn = $('#confirm-pay', root);

        if (isCash) {
          const input = $('#cash-given', root);
          const box = $('#change-box', root);
          const out = $('#change-value', root);
          const update = () => {
            const given = Number(input.value);
            const change = num(given - t.total);
            out.textContent = money(Math.max(change, 0));
            const short = !Number.isFinite(given) || change < -0.0001;
            box.classList.toggle('negative', short);
            $('.change-label', box).textContent = short ? 'Es fehlt' : 'Rückgeld';
            if (short) out.textContent = money(Math.abs(change));
            confirmBtn.disabled = short;
          };
          input.addEventListener('input', update);
          $('#quick-cash', root).addEventListener('click', (e) => {
            const b = e.target.closest('button[data-cash]');
            if (!b) return;
            input.value =
              b.dataset.cash === 'exact' ? t.total.toFixed(2) : Number(b.dataset.cash).toFixed(2);
            update();
          });
          update();
          setTimeout(() => input.select(), 60);
          confirmBtn.addEventListener('click', () =>
            this.finish(method, Number(input.value), t)
          );
        } else {
          confirmBtn.addEventListener('click', () => this.finish(method, null, t));
        }
      },
    });
  },

  async finish(method, cashGiven, t) {
    const btn = $('#confirm-pay');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Speichern …';
    }
    try {
      const order = await DB.createOrder({
        items: State.cart.map((l) => ({
          product_id: l.product_id,
          name: l.name,
          unit_price: l.unit_price,
          qty: l.qty,
          line_total: num(l.unit_price * l.qty),
        })),
        subtotal: t.subtotal,
        discount_name: t.discountName,
        discount_amount: t.discount,
        total: t.total,
        payment_method: method,
        cash_given: method === 'bar' ? num(cashGiven) : null,
        change_due: method === 'bar' ? num(cashGiven - t.total) : null,
        staff_name: State.user?.name || null,
      });

      closeModal();
      this.clear();
      toast(`Bestellung #${order.order_no} gespeichert — ${money(order.total)}`);
      Receipt.show(order);
    } catch (err) {
      fail(err);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Kassieren';
      }
    }
  },

  /* ---------- Events ---------- */

  bind() {
    $('#cat-bar').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-cat]');
      if (!b) return;
      State.category = b.dataset.cat;
      this.renderCategories();
      this.renderProducts();
    });

    $('#product-grid').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-add]');
      if (b) this.add(b.dataset.add);
    });

    $('#cart-items').addEventListener('click', (e) => {
      const plus = e.target.closest('button[data-plus]');
      const minus = e.target.closest('button[data-minus]');
      const rem = e.target.closest('button[data-remove]');
      if (plus) this.changeQty(plus.dataset.plus, 1);
      else if (minus) this.changeQty(minus.dataset.minus, -1);
      else if (rem) this.removeLine(rem.dataset.remove);
    });

    $('#discount-select').addEventListener('change', (e) => {
      State.discountId = e.target.value;
      this.renderCart();
    });

    $('#cart-clear').addEventListener('click', async () => {
      if (await confirmDialog('Warenkorb leeren?', 'Alle Positionen werden verworfen.', 'Leeren'))
        this.clear();
    });

    $('#pay-cash').addEventListener('click', () => this.openPayment('bar'));
    $('#pay-card').addEventListener('click', () => this.openPayment('karte'));
  },
};

/* ==========================================================================
   Bon / Kassenzettel
   ========================================================================== */

const Receipt = {
  build(order) {
    const s = State.settings || {};
    const W = 40;
    const line = (l, r) => {
      const left = String(l);
      const right = String(r);
      const gap = Math.max(1, W - left.length - right.length);
      return left + ' '.repeat(gap) + right;
    };
    const rule = (ch = '-') => ch.repeat(W);
    const center = (txt) => {
      const t = String(txt);
      const pad = Math.max(0, Math.floor((W - t.length) / 2));
      return ' '.repeat(pad) + t;
    };

    const out = [];
    out.push(center((s.shop_name || 'Masora Döner').toUpperCase()));
    if (s.address) out.push(center(s.address));
    if (s.phone) out.push(center('Tel. ' + s.phone));
    if (s.tax_id) out.push(center('St.-Nr. ' + s.tax_id));
    out.push('');
    out.push(line('Bon #' + order.order_no, fmtDateTime(order.created_at)));
    if (order.staff_name) out.push('Bedienung: ' + order.staff_name);
    if (order.status === 'storniert') {
      out.push('');
      out.push(center('*** STORNIERT ***'));
    }
    out.push(rule('='));

    (order.items || []).forEach((it) => {
      out.push(line(`${it.qty}x ${it.name}`, money(it.line_total)));
      if (it.qty > 1) out.push('    ' + money(it.unit_price) + ' / Stück');
    });

    out.push(rule('-'));
    out.push(line('Zwischensumme', money(order.subtotal)));
    if (Number(order.discount_amount) > 0) {
      out.push(line('Rabatt' + (order.discount_name ? ' (' + order.discount_name + ')' : ''),
        '-' + money(order.discount_amount)));
    }
    out.push(rule('='));
    out.push(line('SUMME', money(order.total)));

    const rate = Number(s.vat_rate ?? 19);
    const total = Number(order.total);
    const vat = num(total - total / (1 + rate / 100));
    out.push(line(`enthaltene MwSt. ${rate}%`, money(vat)));
    out.push('');
    out.push(line('Zahlung', order.payment_method === 'bar' ? 'Bar' : 'Karte'));
    if (order.payment_method === 'bar' && order.cash_given != null) {
      out.push(line('Gegeben', money(order.cash_given)));
      out.push(line('Rückgeld', money(order.change_due)));
    }
    out.push('');
    if (s.receipt_footer) out.push(center(s.receipt_footer));
    return out.join('\n');
  },

  show(order) {
    const text = this.build(order);
    openModal({
      title: 'Bon #' + order.order_no,
      bodyHTML: `<div class="receipt" id="receipt-text">${esc(text)}</div>`,
      footHTML: `
        <button class="btn" data-close>Schließen</button>
        <button class="btn btn-primary" id="print-receipt">Drucken</button>`,
      onMount(root) {
        $('#print-receipt', root).addEventListener('click', () => window.print());
      },
    });
  },
};

window.Kasse = Kasse;
window.Receipt = Receipt;
