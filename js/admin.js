/* ==========================================================================
   Verwaltung: Produkte, Rabatte, Personal, Einstellungen, Tagesabschluss
   ========================================================================== */
'use strict';

const Admin = {
  tab: 'produkte',
  products: [],
  discounts: [],
  staff: [],

  open() {
    this.paintTabs();
    this.loadTab();
  },

  paintTabs() {
    $$('#admin-subnav button').forEach((b) =>
      b.setAttribute('aria-current', String(b.dataset.tab === this.tab))
    );
  },

  busy(text = 'Lade …') {
    $('#admin-body').innerHTML =
      `<p class="muted" style="font-size:var(--text-sm)">${esc(text)}</p>`;
  },

  async loadTab() {
    this.busy();
    try {
      if (this.tab === 'produkte') {
        this.products = await DB.listProducts(false);
        this.renderProducts();
      } else if (this.tab === 'rabatte') {
        this.discounts = await DB.listDiscounts(false);
        this.renderDiscounts();
      } else if (this.tab === 'personal') {
        this.staff = await DB.listStaff(false);
        this.renderStaff();
      } else if (this.tab === 'einstellungen') {
        State.settings = await DB.getSettings();
        this.renderSettings();
      } else if (this.tab === 'abschluss') {
        this.renderClosing(await DB.listOrders({ from: startOfDay(0).toISOString() }));
      }
    } catch (err) {
      fail(err);
      $('#admin-body').innerHTML =
        `<p class="muted" style="font-size:var(--text-sm)">Konnte nicht geladen werden.</p>`;
    }
  },

  /* ---------- Produkte ---------- */

  renderProducts() {
    const cats = [...new Set(this.products.map((p) => p.category))];
    $('#admin-body').innerHTML = `
      <div class="row" style="margin-bottom:var(--space-4)">
        <button class="btn btn-primary" data-new-product>+ Neues Produkt</button>
        <span class="muted" style="font-size:var(--text-sm)">
          ${this.products.length} Produkte in ${cats.length} Kategorien</span>
      </div>
      <div class="card"><div class="table-wrap"><table class="data">
        <thead><tr>
          <th>Produkt</th><th>Kategorie</th><th class="num">Preis</th>
          <th>Sortierung</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>${
          this.products.length
            ? this.products
                .map(
                  (p) => `<tr>
            <td class="strong">${esc(p.name)}</td>
            <td class="muted">${esc(p.category)}</td>
            <td class="num">${money(p.price)}</td>
            <td class="muted">${p.sort_order}</td>
            <td><span class="tag ${p.is_active ? 'ok' : ''}">${p.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
            <td><div class="row" style="gap:var(--space-2);flex-wrap:nowrap">
              <button class="btn btn-sm" data-edit-product="${p.id}">Bearbeiten</button>
              <button class="btn btn-sm btn-danger" data-del-product="${p.id}">Löschen</button>
            </div></td></tr>`
                )
                .join('')
            : `<tr><td colspan="6" class="muted" style="padding:var(--space-8);text-align:center">
                 Noch keine Produkte angelegt.</td></tr>`
        }</tbody>
      </table></div></div>`;
  },

  /**
   * Ermittelt die Reihenfolge-Nummer einer Kategorie.
   * Bekannte Kategorie -> gleiche Nummer wie bisher.
   * Neue Kategorie -> hinten anstellen.
   */
  categoryOrderFor(category) {
    const match = (this.products || []).find((p) => p.category === category);
    if (match && Number.isFinite(Number(match.category_order))) {
      return Number(match.category_order);
    }
    const max = (this.products || []).reduce(
      (acc, p) => Math.max(acc, Number(p.category_order) || 0),
      0,
    );
    return max + 10;
  },

  productForm(p = null) {
    const cats = [...new Set(this.products.map((x) => x.category))];
    openModal({
      title: p ? 'Produkt bearbeiten' : 'Neues Produkt',
      bodyHTML: `
        <div class="field">
          <label for="f-name">Name</label>
          <input class="input" id="f-name" value="${esc(p?.name || '')}" placeholder="z. B. Döner mit Käse">
        </div>
        <div class="field">
          <label for="f-cat">Kategorie</label>
          <input class="input" id="f-cat" list="cat-list" value="${esc(p?.category || cats[0] || 'Döner')}">
          <datalist id="cat-list">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="f-price">Preis in Euro</label>
          <input class="input" id="f-price" type="number" step="0.10" min="0"
                 inputmode="decimal" value="${p ? Number(p.price).toFixed(2) : '0.00'}">
        </div>
        <div class="field">
          <label for="f-sort">Sortierung (kleine Zahl = weiter vorne)</label>
          <input class="input" id="f-sort" type="number" step="1" value="${p?.sort_order ?? 0}">
        </div>
        <div class="field">
          <label for="f-active">Status</label>
          <select class="select" id="f-active">
            <option value="1" ${p?.is_active !== false ? 'selected' : ''}>Aktiv — in der Kasse sichtbar</option>
            <option value="0" ${p?.is_active === false ? 'selected' : ''}>Inaktiv — ausgeblendet</option>
          </select>
        </div>`,
      footHTML: `<button class="btn" data-close>Abbrechen</button>
                 <button class="btn btn-primary" id="f-save">Speichern</button>`,
      onMount: (root) => {
        $('#f-save', root).addEventListener('click', async () => {
          const category = $('#f-cat', root).value.trim() || 'Sonstiges';
          const payload = {
            name: $('#f-name', root).value.trim(),
            category,
            category_order: this.categoryOrderFor(category),
            price: num($('#f-price', root).value),
            sort_order: parseInt($('#f-sort', root).value, 10) || 0,
            is_active: $('#f-active', root).value === '1',
          };
          if (!payload.name) return toast('Bitte einen Namen eingeben', 'error');
          try {
            if (p) await DB.updateProduct(p.id, payload);
            else await DB.createProduct(payload);
            closeModal();
            toast(p ? 'Produkt aktualisiert' : 'Produkt angelegt');
            await this.loadTab();
            await this.refreshKasse();
          } catch (err) {
            fail(err);
          }
        });
      },
    });
  },

  /* ---------- Rabatte ---------- */

  renderDiscounts() {
    $('#admin-body').innerHTML = `
      <div class="row" style="margin-bottom:var(--space-4)">
        <button class="btn btn-primary" data-new-discount>+ Neuer Rabatt</button>
      </div>
      <div class="card"><div class="table-wrap"><table class="data">
        <thead><tr><th>Bezeichnung</th><th>Art</th><th class="num">Wert</th><th>Status</th><th></th></tr></thead>
        <tbody>${
          this.discounts.length
            ? this.discounts
                .map(
                  (d) => `<tr>
            <td class="strong">${esc(d.name)}</td>
            <td class="muted">${d.kind === 'percent' ? 'Prozent' : 'Fester Betrag'}</td>
            <td class="num">${d.kind === 'percent' ? Number(d.value) + ' %' : money(d.value)}</td>
            <td><span class="tag ${d.is_active ? 'ok' : ''}">${d.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
            <td><div class="row" style="gap:var(--space-2);flex-wrap:nowrap">
              <button class="btn btn-sm" data-edit-discount="${d.id}">Bearbeiten</button>
              <button class="btn btn-sm btn-danger" data-del-discount="${d.id}">Löschen</button>
            </div></td></tr>`
                )
                .join('')
            : `<tr><td colspan="5" class="muted" style="padding:var(--space-8);text-align:center">
                 Noch keine Rabatte angelegt.</td></tr>`
        }</tbody></table></div></div>`;
  },

  discountForm(d = null) {
    openModal({
      title: d ? 'Rabatt bearbeiten' : 'Neuer Rabatt',
      bodyHTML: `
        <div class="field">
          <label for="d-name">Bezeichnung</label>
          <input class="input" id="d-name" value="${esc(d?.name || '')}" placeholder="z. B. Stammkunde 10%">
        </div>
        <div class="field">
          <label for="d-kind">Art</label>
          <select class="select" id="d-kind">
            <option value="percent" ${d?.kind !== 'fixed' ? 'selected' : ''}>Prozent vom Gesamtbetrag</option>
            <option value="fixed" ${d?.kind === 'fixed' ? 'selected' : ''}>Fester Betrag in Euro</option>
          </select>
        </div>
        <div class="field">
          <label for="d-value">Wert</label>
          <input class="input" id="d-value" type="number" step="0.5" min="0"
                 inputmode="decimal" value="${d ? Number(d.value) : 10}">
        </div>
        <div class="field">
          <label for="d-active">Status</label>
          <select class="select" id="d-active">
            <option value="1" ${d?.is_active !== false ? 'selected' : ''}>Aktiv</option>
            <option value="0" ${d?.is_active === false ? 'selected' : ''}>Inaktiv</option>
          </select>
        </div>`,
      footHTML: `<button class="btn" data-close>Abbrechen</button>
                 <button class="btn btn-primary" id="d-save">Speichern</button>`,
      onMount: (root) => {
        $('#d-save', root).addEventListener('click', async () => {
          const payload = {
            name: $('#d-name', root).value.trim(),
            kind: $('#d-kind', root).value,
            value: num($('#d-value', root).value),
            is_active: $('#d-active', root).value === '1',
          };
          if (!payload.name) return toast('Bitte eine Bezeichnung eingeben', 'error');
          try {
            if (d) await DB.updateDiscount(d.id, payload);
            else await DB.createDiscount(payload);
            closeModal();
            toast('Gespeichert');
            await this.loadTab();
            await this.refreshKasse();
          } catch (err) {
            fail(err);
          }
        });
      },
    });
  },

  /* ---------- Personal ---------- */

  renderStaff() {
    $('#admin-body').innerHTML = `
      <div class="row" style="margin-bottom:var(--space-4)">
        <button class="btn btn-primary" data-new-staff>+ Neuer Mitarbeiter</button>
        <span class="muted" style="font-size:var(--text-sm)">
          Der PIN dient zum Anmelden an der Kasse.</span>
      </div>
      <div class="card"><div class="table-wrap"><table class="data">
        <thead><tr><th>Name</th><th>Rolle</th><th>PIN</th><th>Status</th><th></th></tr></thead>
        <tbody>${this.staff
          .map(
            (s) => `<tr>
          <td class="strong">${esc(s.name)}</td>
          <td class="muted">${s.role === 'admin' ? 'Admin' : 'Kasse'}</td>
          <td class="muted">••••</td>
          <td><span class="tag ${s.is_active ? 'ok' : ''}">${s.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
          <td><div class="row" style="gap:var(--space-2);flex-wrap:nowrap">
            <button class="btn btn-sm" data-edit-staff="${s.id}">Bearbeiten</button>
            <button class="btn btn-sm btn-danger" data-del-staff="${s.id}">Löschen</button>
          </div></td></tr>`
          )
          .join('')}</tbody></table></div></div>`;
  },

  staffForm(s = null) {
    openModal({
      title: s ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter',
      bodyHTML: `
        <div class="field">
          <label for="s-name">Name</label>
          <input class="input" id="s-name" value="${esc(s?.name || '')}" placeholder="z. B. Ali">
        </div>
        <div class="field">
          <label for="s-pin">PIN (4 Ziffern)</label>
          <input class="input" id="s-pin" inputmode="numeric" maxlength="4"
                 value="${esc(s?.pin || '')}" placeholder="1234">
        </div>
        <div class="field">
          <label for="s-role">Rolle</label>
          <select class="select" id="s-role">
            <option value="kasse" ${s?.role !== 'admin' ? 'selected' : ''}>Kasse — nur kassieren</option>
            <option value="admin" ${s?.role === 'admin' ? 'selected' : ''}>Admin — Verwaltung und Storno</option>
          </select>
        </div>
        <div class="field">
          <label for="s-active">Status</label>
          <select class="select" id="s-active">
            <option value="1" ${s?.is_active !== false ? 'selected' : ''}>Aktiv</option>
            <option value="0" ${s?.is_active === false ? 'selected' : ''}>Inaktiv</option>
          </select>
        </div>`,
      footHTML: `<button class="btn" data-close>Abbrechen</button>
                 <button class="btn btn-primary" id="s-save">Speichern</button>`,
      onMount: (root) => {
        $('#s-save', root).addEventListener('click', async () => {
          const pin = $('#s-pin', root).value.trim();
          const payload = {
            name: $('#s-name', root).value.trim(),
            pin,
            role: $('#s-role', root).value,
            is_active: $('#s-active', root).value === '1',
          };
          if (!payload.name) return toast('Bitte einen Namen eingeben', 'error');
          if (!/^\d{4}$/.test(pin)) return toast('Der PIN muss aus 4 Ziffern bestehen', 'error');
          try {
            if (s) await DB.updateStaff(s.id, payload);
            else await DB.createStaff(payload);
            closeModal();
            toast('Gespeichert');
            State.staff = await DB.listStaff(true);
            await this.loadTab();
          } catch (err) {
            fail(err);
          }
        });
      },
    });
  },

  /* ---------- Einstellungen ---------- */

  renderSettings() {
    const s = State.settings || {};
    $('#admin-body').innerHTML = `
      <div class="card" style="max-width:760px">
        <div class="form-grid">
          <div class="field"><label for="set-name">Name des Imbiss</label>
            <input class="input" id="set-name" value="${esc(s.shop_name || '')}"></div>
          <div class="field"><label for="set-phone">Telefon</label>
            <input class="input" id="set-phone" value="${esc(s.phone || '')}"></div>
          <div class="field" style="grid-column:1/-1"><label for="set-address">Adresse</label>
            <input class="input" id="set-address" value="${esc(s.address || '')}"></div>
          <div class="field"><label for="set-tax">Steuernummer</label>
            <input class="input" id="set-tax" value="${esc(s.tax_id || '')}"></div>
          <div class="field"><label for="set-vat">MwSt.-Satz in Prozent</label>
            <input class="input" id="set-vat" type="number" step="0.5" min="0"
                   value="${Number(s.vat_rate ?? 19)}"></div>
          <div class="field" style="grid-column:1/-1"><label for="set-footer">Text unten auf dem Bon</label>
            <input class="input" id="set-footer" value="${esc(s.receipt_footer || '')}"></div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="set-save">Einstellungen speichern</button>
        </div>
      </div>`;

    $('#set-save').addEventListener('click', async () => {
      try {
        State.settings = await DB.saveSettings({
          shop_name: $('#set-name').value.trim() || 'Masora Döner',
          phone: $('#set-phone').value.trim(),
          address: $('#set-address').value.trim(),
          tax_id: $('#set-tax').value.trim(),
          vat_rate: num($('#set-vat').value),
          receipt_footer: $('#set-footer').value.trim(),
        });
        App.paintBrand();
        Kasse.renderCart();
        toast('Einstellungen gespeichert');
      } catch (err) {
        fail(err);
      }
    });
  },

  /* ---------- Tagesabschluss ---------- */

  renderClosing(orders) {
    const valid = orders.filter((o) => o.status !== 'storniert');
    const sum = (arr) => num(arr.reduce((s, o) => s + Number(o.total), 0));
    const cash = valid.filter((o) => o.payment_method === 'bar');
    const card = valid.filter((o) => o.payment_method === 'karte');
    const rate = Number(State.settings?.vat_rate ?? 19);
    const revenue = sum(valid);
    const vat = num(revenue - revenue / (1 + rate / 100));
    const discounts = num(valid.reduce((s, o) => s + Number(o.discount_amount), 0));

    const perProduct = {};
    valid.forEach((o) =>
      (o.items || []).forEach((i) => {
        if (!perProduct[i.name]) perProduct[i.name] = { qty: 0, total: 0 };
        perProduct[i.name].qty += Number(i.qty);
        perProduct[i.name].total = num(perProduct[i.name].total + Number(i.line_total));
      })
    );
    const top = Object.entries(perProduct).sort((a, b) => b[1].qty - a[1].qty);

    const today = new Date().toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    $('#admin-body').innerHTML = `
      <div class="stack">
        <div>
          <div class="section-title">Tagesabschluss · ${esc(today)}</div>
          <div class="stats" style="margin-bottom:0">
            <div class="stat accent"><div class="stat-label">Tagesumsatz</div>
              <div class="stat-value">${money(revenue)}</div></div>
            <div class="stat"><div class="stat-label">Bestellungen</div>
              <div class="stat-value">${valid.length}</div></div>
            <div class="stat"><div class="stat-label">Bar</div>
              <div class="stat-value">${money(sum(cash))}</div></div>
            <div class="stat"><div class="stat-label">Karte</div>
              <div class="stat-value">${money(sum(card))}</div></div>
            <div class="stat"><div class="stat-label">enth. MwSt. ${rate}%</div>
              <div class="stat-value">${money(vat)}</div></div>
            <div class="stat"><div class="stat-label">Rabatte</div>
              <div class="stat-value">${money(discounts)}</div></div>
            <div class="stat"><div class="stat-label">Stornos</div>
              <div class="stat-value">${orders.length - valid.length}</div></div>
          </div>
        </div>
        <div>
          <div class="section-title">Verkaufte Artikel</div>
          <div class="card"><div class="table-wrap"><table class="data">
            <thead><tr><th>Artikel</th><th class="num">Menge</th><th class="num">Umsatz</th></tr></thead>
            <tbody>${
              top.length
                ? top
                    .map(
                      ([name, v]) => `<tr><td>${esc(name)}</td>
                        <td class="num">${v.qty}</td>
                        <td class="num">${money(v.total)}</td></tr>`
                    )
                    .join('')
                : `<tr><td colspan="3" class="muted" style="padding:var(--space-8);text-align:center">
                     Heute wurde noch nichts verkauft.</td></tr>`
            }</tbody></table></div></div>
        </div>
      </div>`;
  },

  async refreshKasse() {
    State.products = await DB.listProducts(true);
    State.discounts = await DB.listDiscounts(true);
    if (State.discountId && !State.discounts.some((d) => d.id === State.discountId))
      State.discountId = '';
    State.cart = State.cart.filter((l) => State.products.some((p) => p.id === l.product_id));
    Kasse.render();
  },

  /* ---------- Events ---------- */

  bind() {
    $('#admin-subnav').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      this.tab = b.dataset.tab;
      this.paintTabs();
      this.loadTab();
    });

    $('#admin-body').addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('[data-new-product]')) return this.productForm();
      if (t.closest('[data-new-discount]')) return this.discountForm();
      if (t.closest('[data-new-staff]')) return this.staffForm();

      const ep = t.closest('[data-edit-product]');
      if (ep) return this.productForm(this.products.find((p) => p.id === ep.dataset.editProduct));
      const ed = t.closest('[data-edit-discount]');
      if (ed) return this.discountForm(this.discounts.find((d) => d.id === ed.dataset.editDiscount));
      const es = t.closest('[data-edit-staff]');
      if (es) return this.staffForm(this.staff.find((s) => s.id === es.dataset.editStaff));

      const dp = t.closest('[data-del-product]');
      if (dp) {
        const p = this.products.find((x) => x.id === dp.dataset.delProduct);
        if (
          p &&
          (await confirmDialog('Produkt löschen?', `„${p.name}" wird endgültig entfernt.`, 'Löschen'))
        ) {
          try {
            await DB.deleteProduct(p.id);
            toast('Produkt gelöscht');
            await this.loadTab();
            await this.refreshKasse();
          } catch (err) {
            fail(err);
          }
        }
        return;
      }

      const dd = t.closest('[data-del-discount]');
      if (dd) {
        const d = this.discounts.find((x) => x.id === dd.dataset.delDiscount);
        if (
          d &&
          (await confirmDialog('Rabatt löschen?', `„${d.name}" wird entfernt.`, 'Löschen'))
        ) {
          try {
            await DB.deleteDiscount(d.id);
            toast('Rabatt gelöscht');
            await this.loadTab();
            await this.refreshKasse();
          } catch (err) {
            fail(err);
          }
        }
        return;
      }

      const ds = t.closest('[data-del-staff]');
      if (ds) {
        const s = this.staff.find((x) => x.id === ds.dataset.delStaff);
        if (!s) return;
        if (s.id === State.user?.id) return toast('Das eigene Konto kann nicht gelöscht werden', 'error');
        if (await confirmDialog('Mitarbeiter löschen?', `„${s.name}" wird entfernt.`, 'Löschen')) {
          try {
            await DB.deleteStaff(s.id);
            toast('Mitarbeiter gelöscht');
            State.staff = await DB.listStaff(true);
            await this.loadTab();
          } catch (err) {
            fail(err);
          }
        }
      }
    });
  },
};

window.Admin = Admin;
