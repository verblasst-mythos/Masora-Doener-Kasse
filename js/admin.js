/* ==========================================================================
   Verwaltung: Produkte, Rabatte, Personal, Einstellungen, Tagesabschluss
   ========================================================================== */
"use strict";

const Admin = {
  tab: "produkte",
  products: [],
  discounts: [],
  coops: [],
  staff: [],
  moves: [],
  shifts: [],
  shiftRange: 7, // Tage für die Dienstzeiten-Übersicht

  open() {
    // Tabs basierend auf Rolle ein-/ausblenden
    const role = State.userRole || State.user?.role || 'kasse';
    
    // Welche Tabs darf welche Rolle sehen?
    const allowedTabs = {
      produkte: ['admin', 'service', 'lager'],
      lager: ['admin', 'lager'],
      rabatte: ['admin'],
      kooperationen: ['admin'],
      personal: ['admin'],
      dienstzeiten: ['admin', 'service'],
      einstellungen: ['admin'],
      abschluss: ['admin'],
    };
    
    // Tabs ein-/ausblenden
    $$('#admin-subnav button').forEach(btn => {
      const tab = btn.dataset.tab;
      const allowed = allowedTabs[tab] || ['admin'];
      btn.classList.toggle('hidden', !allowed.includes(role));
    });
    
    // Ersten sichtbaren Tab aktivieren
    const firstVisible = $('#admin-subnav button:not(.hidden)');
    if (firstVisible) {
      this.tab = firstVisible.dataset.tab;
    }
    
    // Tabs malen und laden
    this.paintTabs();
    this.loadTab();
  },

  paintTabs() {
    $$("#admin-subnav button").forEach((b) =>
      b.setAttribute("aria-current", String(b.dataset.tab === this.tab)),
    );
  },

  busy(text = "Lade …") {
    $("#admin-body").innerHTML =
      `<p class="muted" style="font-size:var(--text-sm)">${esc(text)}</p>`;
  },

  async loadTab() {
    this.busy();
    try {
      if (this.tab === "produkte") {
        this.products = await DB.listProducts(false);
        this.renderProducts();
      } else if (this.tab === "rabatte") {
        this.discounts = await DB.listDiscounts(false);
        this.renderDiscounts();
      } else if (this.tab === "personal") {
        this.staff = await DB.listStaff(false);
        this.renderStaff();
      } else if (this.tab === "kooperationen") {
        this.coops = await DB.listCoops(false);
        this.renderCoops();
      } else if (this.tab === "lager") {
        const [products, moves] = await Promise.all([
          DB.listProducts(false),
          DB.listStockMoves({ limit: 40 }),
        ]);
        this.products = products;
        this.moves = moves;
        this.renderStock();
      } else if (this.tab === "dienstzeiten") {
        const from = startOfDay(-(this.shiftRange - 1)).toISOString();
        const [shifts, staff] = await Promise.all([
          DB.listShifts({ from }),
          DB.listStaff(false),
        ]);
        this.shifts = shifts;
        this.staff = staff;
        this.renderShifts();
      } else if (this.tab === "einstellungen") {
        State.settings = await DB.getSettings();
        this.renderSettings();
      } else if (this.tab === "abschluss") {
        this.renderClosing(
          await DB.listOrders({ from: startOfDay(0).toISOString() }),
        );
      }
    } catch (err) {
      fail(err);
      $("#admin-body").innerHTML =
        `<p class="muted" style="font-size:var(--text-sm)">Konnte nicht geladen werden.</p>`;
    }
  },

  /* --------------------------------------------------------------------------
     Produkte
     -------------------------------------------------------------------------- */

  renderProducts() {
    const cats = [...new Set(this.products.map((p) => p.category || "Sonstiges"))];
    let html = `
      <div class="toolbar">
        <button class="btn btn-primary" id="prod-add">+ Produkt</button>
        <span class="spacer"></span>
        <span class="muted" style="font-size:var(--text-sm)">${this.products.length} Produkte</span>
      </div>
      <div class="card" style="margin-top:var(--space-4)">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kategorie</th>
                <th class="num">Preis</th>
                <th class="num">MwSt.</th>
                <th>Lager</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
    `;

    for (const p of this.products) {
      const vatRate = Number(p.vat_rate || 0) * 100;
      const stockInfo = p.track_stock
        ? `<span class="${p.stock <= p.min_stock ? 'text-error' : 'muted'}">${p.stock} / ${p.min_stock}</span>`
        : '<span class="muted">—</span>';

      html += `
        <tr>
          <td>${esc(p.name)}</td>
          <td>${esc(p.category || "Sonstiges")}</td>
          <td class="num">${money(p.price)}</td>
          <td class="num">${vatRate.toFixed(0)} %</td>
          <td>${stockInfo}</td>
          <td class="actions">
            <button class="icon-btn" data-edit="${p.id}" aria-label="Bearbeiten">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn" data-delete="${p.id}" aria-label="Löschen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    $("#admin-body").innerHTML = html;

    // Bindings
    $("#prod-add")?.addEventListener("click", () => this.editProduct());
    $$("#admin-body [data-edit]").forEach((b) =>
      b.addEventListener("click", () => this.editProduct(b.dataset.edit)),
    );
    $$("#admin-body [data-delete]").forEach((b) =>
      b.addEventListener("click", () => this.deleteProduct(b.dataset.delete)),
    );
  },

  async editProduct(id = null) {
    const p = id ? this.products.find((x) => x.id === id) : null;
    const isNew = !p;

    openModal({
      title: isNew ? "Produkt hinzufügen" : "Produkt bearbeiten",
      bodyHTML: `
        <div class="field">
          <label for="prod-name">Name</label>
          <input id="prod-name" type="text" value="${esc(p?.name || "")}" />
        </div>
        <div class="field">
          <label for="prod-cat">Kategorie</label>
          <input id="prod-cat" type="text" value="${esc(p?.category || "")}" />
        </div>
        <div class="field">
          <label for="prod-price">Preis (€)</label>
          <input id="prod-price" type="number" step="0.01" value="${p?.price || ""}" />
        </div>
        <div class="field">
          <label for="prod-vat">MwSt. (%)</label>
          <input id="prod-vat" type="number" step="0.1" value="${Number(p?.vat_rate || 0) * 100}" />
        </div>
        <div class="field">
          <label for="prod-stock">Lagerbestand</label>
          <input id="prod-stock" type="number" step="0.01" value="${p?.stock ?? 0}" />
        </div>
        <div class="field">
          <label for="prod-minstock">Mindestbestand</label>
          <input id="prod-minstock" type="number" step="0.01" value="${p?.min_stock ?? 0}" />
        </div>
        <div class="field">
          <label>
            <input type="checkbox" id="prod-track" ${p?.track_stock ? "checked" : ""} />
            Lagerverwaltung aktivieren
          </label>
        </div>
      `,
      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" data-save>${isNew ? "Hinzufügen" : "Speichern"}</button>
      `,
      onMount(root) {
        $("[data-save]", root).addEventListener("click", async () => {
          const name = $("#prod-name", root).value.trim();
          const category = $("#prod-cat", root).value.trim() || "Sonstiges";
          const price = parseFloat($("#prod-price", root).value) || 0;
          const vat_rate = (parseFloat($("#prod-vat", root).value) || 0) / 100;
          const stock = parseFloat($("#prod-stock", root).value) || 0;
          const min_stock = parseFloat($("#prod-minstock", root).value) || 0;
          const track_stock = $("#prod-track", root).checked;

          if (!name) {
            toast("Name darf nicht leer sein", "error");
            return;
          }

          try {
            if (isNew) {
              await DB.createProduct({ name, category, price, vat_rate, stock, min_stock, track_stock });
            } else {
              await DB.updateProduct(p.id, { name, category, price, vat_rate, stock, min_stock, track_stock });
            }
            closeModal();
            await Admin.loadTab();
            toast(isNew ? "Produkt hinzugefügt" : "Produkt gespeichert");
          } catch (err) {
            fail(err);
          }
        });
      },
    });
  },

  async deleteProduct(id) {
    const p = this.products.find((x) => x.id === id);
    if (!p) return;

    const ok = await confirmDialog(
      "Produkt löschen?",
      `"${p.name}" wird endgültig gelöscht.`,
      "Löschen",
    );
    if (!ok) return;

    try {
      await DB.deleteProduct(id);
      await this.loadTab();
      toast("Produkt gelöscht");
    } catch (err) {
      fail(err);
    }
  },

  /* --------------------------------------------------------------------------
     Lager
     -------------------------------------------------------------------------- */

  renderStock() {
    let html = `
      <div class="toolbar">
        <button class="btn btn-primary" id="stock-add">+ Wareneingang</button>
        <span class="spacer"></span>
        <span class="muted" style="font-size:var(--text-sm)">${this.products.length} Produkte</span>
      </div>
      <div class="card" style="margin-top:var(--space-4)">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Produkt</th>
                <th class="num">Aktuell</th>
                <th class="num">Min.</th>
                <th>Status</th>
                <th>Letzte Bewegung</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
    `;

    for (const p of this.products.filter((x) => x.track_stock)) {
      const lastMove = this.moves.find((m) => m.product_id === p.id);
      const status =
        p.stock <= 0
          ? '<span class="text-error">Ausverkauft</span>'
          : p.stock <= p.min_stock
          ? '<span class="text-warn">Niedrig</span>'
          : '<span class="text-success">OK</span>';

      html += `
        <tr>
          <td>${esc(p.name)}</td>
          <td class="num">${p.stock}</td>
          <td class="num">${p.min_stock}</td>
          <td>${status}</td>
          <td>${lastMove ? fmtDateTime(lastMove.created_at) : '—'}</td>
          <td class="actions">
            <button class="icon-btn" data-adjust="${p.id}" aria-label="Bestand anpassen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </td>
        </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    $("#admin-body").innerHTML = html;

    $("#stock-add")?.addEventListener("click", () => this.adjustStock());
    $$("#admin-body [data-adjust]").forEach((b) =>
      b.addEventListener("click", () => this.adjustStock(b.dataset.adjust)),
    );
  },

  async adjustStock(productId = null) {
    const products = this.products.filter((x) => x.track_stock);
    const product = productId ? products.find((p) => p.id === productId) : products[0];

    if (!product) {
      toast("Keine Produkte mit Lagerverwaltung", "error");
      return;
    }

    openModal({
      title: "Lagerbestand anpassen",
      bodyHTML: `
        <div class="field">
          <label for="adj-product">Produkt</label>
          <select id="adj-product">
            ${products.map((p) => `<option value="${p.id}" ${p.id === product.id ? 'selected' : ''}>${esc(p.name)} (${p.stock})</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="adj-delta">Änderung (+/-)</label>
          <input id="adj-delta" type="number" step="0.01" value="0" />
        </div>
        <div class="field">
          <label for="adj-reason">Grund</label>
          <select id="adj-reason">
            <option value="wareneingang">Wareneingang</option>
            <option value="korrektur">Korrektur</option>
            <option value="schwund">Schwund</option>
          </select>
        </div>
      `,
      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" data-save>Buchen</button>
      `,
      onMount(root) {
        $("[data-save]", root).addEventListener("click", async () => {
          const pid = $("#adj-product", root).value;
          const delta = parseFloat($("#adj-delta", root).value) || 0;
          const reason = $("#adj-reason", root).value;

          if (delta === 0) {
            toast("Änderung darf nicht 0 sein", "error");
            return;
          }

          try {
            await DB.adjustStock(pid, delta, reason, State.user?.name || "Unbekannt");
            closeModal();
            await Admin.loadTab();
            toast("Lagerbestand aktualisiert");
          } catch (err) {
            fail(err);
          }
        });
      },
    });
  },

  /* --------------------------------------------------------------------------
     Rabatte
     -------------------------------------------------------------------------- */

  renderDiscounts() {
    let html = `
      <div class="toolbar">
        <button class="btn btn-primary" id="disc-add">+ Rabatt</button>
        <span class="spacer"></span>
        <span class="muted" style="font-size:var(--text-sm)">${this.discounts.length} Rabatte</span>
      </div>
      <div class="card" style="margin-top:var(--space-4)">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Art</th>
                <th class="num">Wert</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
    `;

    for (const d of this.discounts) {
      const kind = d.kind === 'percent' ? 'Prozent' : 'Euro';
      const value = d.kind === 'percent' ? `${d.value}%` : money(d.value);

      html += `
        <tr>
          <td>${esc(d.name)}</td>
          <td>${kind}</td>
          <td class="num">${value}</td>
          <td class="actions">
            <button class="icon-btn" data-edit="${d.id}" aria-label="Bearbeiten">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn" data-delete="${d.id}" aria-label="Löschen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    $("#admin-body").innerHTML = html;

    $("#disc-add")?.addEventListener("click", () => this.editDiscount());
    $$("#admin-body [data-edit]").forEach((b) =>
      b.addEventListener("click", () => this.editDiscount(b.dataset.edit)),
    );
    $$("#admin-body [data-delete]").forEach((b) =>
      b.addEventListener("click", () => this.deleteDiscount(b.dataset.delete)),
    );
  },

  async editDiscount(id = null) {
    const d = id ? this.discounts.find((x) => x.id === id) : null;
    const isNew = !d;

    openModal({
      title: isNew ? "Rabatt hinzufügen" : "Rabatt bearbeiten",
      bodyHTML: `
        <div class="field">
          <label for="disc-name">Name</label>
          <input id="disc-name" type="text" value="${esc(d?.name || "")}" />
        </div>
        <div class="field">
          <label for="disc-kind">Art</label>
          <select id="disc-kind">
            <option value="percent" ${d?.kind === 'percent' ? 'selected' : ''}>Prozent (%)</option>
            <option value="fixed" ${d?.kind === 'fixed' ? 'selected' : ''}>Fester Betrag (€)</option>
          </select>
        </div>
        <div class="field">
          <label for="disc-value">Wert</label>
          <input id="disc-value" type="number" step="0.01" value="${d?.value ?? ''}" />
        </div>
      `,
      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" data-save>${isNew ? "Hinzufügen" : "Speichern"}</button>
      `,
      onMount(root) {
        $("[data-save]", root).addEventListener("click", async () => {
          const name = $("#disc-name", root).value.trim();
          const kind = $("#disc-kind", root).value;
          const value = parseFloat($("#disc-value", root).value) || 0;

          if (!name) {
            toast("Name darf nicht leer sein", "error");
            return;
          }

          try {
            if (isNew) {
              await DB.createDiscount({ name, kind, value });
            } else {
              await DB.updateDiscount(d.id, { name, kind, value });
            }
            closeModal();
            await Admin.loadTab();
            toast(isNew ? "Rabatt hinzugefügt" : "Rabatt gespeichert");
          } catch (err) {
            fail(err);
          }
        });
      },
    });
  },

  async deleteDiscount(id) {
    const d = this.discounts.find((x) => x.id === id);
    if (!d) return;

    const ok = await confirmDialog(
      "Rabatt löschen?",
      `"${d.name}" wird endgültig gelöscht.`,
      "Löschen",
    );
    if (!ok) return;

    try {
      await DB.deleteDiscount(id);
      await this.loadTab();
      toast("Rabatt gelöscht");
    } catch (err) {
      fail(err);
    }
  },

  /* --------------------------------------------------------------------------
     Kooperationen
     -------------------------------------------------------------------------- */

  renderCoops() {
    let html = `
      <div class="toolbar">
        <button class="btn btn-primary" id="coop-add">+ Kooperation</button>
        <span class="spacer"></span>
        <span class="muted" style="font-size:var(--text-sm)">${this.coops.length} Kooperationen</span>
      </div>
      <div class="card" style="margin-top:var(--space-4)">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Art</th>
                <th class="num">Wert</th>
                <th>Code</th>
                <th>Aktiv</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
    `;

    for (const c of this.coops) {
      const kind = c.kind === 'percent' ? 'Prozent' : 'Euro';
      const value = c.kind === 'percent' ? `${c.value}%` : money(c.value);

      html += `
        <tr>
          <td>${esc(c.name)}</td>
          <td>${kind}</td>
          <td class="num">${value}</td>
          <td><code>${esc(c.code)}</code></td>
          <td>${c.is_active ? '✅' : '❌'}</td>
          <td class="actions">
            <button class="icon-btn" data-edit="${c.id}" aria-label="Bearbeiten">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn" data-delete="${c.id}" aria-label="Löschen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    $("#admin-body").innerHTML = html;

    $("#coop-add")?.addEventListener("click", () => this.editCoop());
    $$("#admin-body [data-edit]").forEach((b) =>
      b.addEventListener("click", () => this.editCoop(b.dataset.edit)),
    );
    $$("#admin-body [data-delete]").forEach((b) =>
      b.addEventListener("click", () => this.deleteCoop(b.dataset.delete)),
    );
  },

  async editCoop(id = null) {
    const c = id ? this.coops.find((x) => x.id === id) : null;
    const isNew = !c;

    openModal({
      title: isNew ? "Kooperation hinzufügen" : "Kooperation bearbeiten",
      bodyHTML: `
        <div class="field">
          <label for="coop-name">Name</label>
          <input id="coop-name" type="text" value="${esc(c?.name || "")}" />
        </div>
        <div class="field">
          <label for="coop-kind">Art</label>
          <select id="coop-kind">
            <option value="percent" ${c?.kind === 'percent' ? 'selected' : ''}>Prozent (%)</option>
            <option value="fixed" ${c?.kind === 'fixed' ? 'selected' : ''}>Fester Betrag (€)</option>
          </select>
        </div>
        <div class="field">
          <label for="coop-value">Wert</label>
          <input id="coop-value" type="number" step="0.01" value="${c?.value ?? ''}" />
        </div>
        <div class="field">
          <label for="coop-code">Code</label>
          <input id="coop-code" type="text" value="${esc(c?.code || "")}" />
        </div>
        <div class="field">
          <label>
            <input type="checkbox" id="coop-active" ${c?.is_active ? 'checked' : ''} />
            Aktiv
          </label>
        </div>
      `,
      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" data-save>${isNew ? "Hinzufügen" : "Speichern"}</button>
      `,
      onMount(root) {
        $("[data-save]", root).addEventListener("click", async () => {
          const name = $("#coop-name", root).value.trim();
          const kind = $("#coop-kind", root).value;
          const value = parseFloat($("#coop-value", root).value) || 0;
          const code = $("#coop-code", root).value.trim();
          const is_active = $("#coop-active", root).checked;

          if (!name || !code) {
            toast("Name und Code dürfen nicht leer sein", "error");
            return;
          }

          try {
            if (isNew) {
              await DB.createCoop({ name, kind, value, code, is_active });
            } else {
              await DB.updateCoop(c.id, { name, kind, value, code, is_active });
            }
            closeModal();
            await Admin.loadTab();
            toast(isNew ? "Kooperation hinzugefügt" : "Kooperation gespeichert");
          } catch (err) {
            fail(err);
          }
        });
      },
    });
  },

  async deleteCoop(id) {
    const c = this.coops.find((x) => x.id === id);
    if (!c) return;

    const ok = await confirmDialog(
      "Kooperation löschen?",
      `"${c.name}" wird endgültig gelöscht.`,
      "Löschen",
    );
    if (!ok) return;

    try {
      await DB.deleteCoop(id);
      await this.loadTab();
      toast("Kooperation gelöscht");
    } catch (err) {
      fail(err);
    }
  },

  /* --------------------------------------------------------------------------
     Personal
     -------------------------------------------------------------------------- */

  renderStaff() {
    let html = `
      <div class="toolbar">
        <button class="btn btn-primary" id="staff-add">+ Mitarbeiter</button>
        <span class="spacer"></span>
        <span class="muted" style="font-size:var(--text-sm)">${this.staff.length} Mitarbeiter</span>
      </div>
      <div class="card" style="margin-top:var(--space-4)">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Rolle</th>
                <th>PIN</th>
                <th>Aktiv</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
    `;

    for (const s of this.staff) {
      const roleNames = { admin: 'Admin', service: 'Service', lager: 'Lager', kasse: 'Kasse' };
      const role = roleNames[s.role] || s.role;

      html += `
        <tr>
          <td>${esc(s.name)}</td>
          <td>${role}</td>
          <td><code>${esc(s.pin || "—")}</code></td>
          <td>${s.is_active ? '✅' : '❌'}</td>
          <td class="actions">
            <button class="icon-btn" data-edit="${s.id}" aria-label="Bearbeiten">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn" data-delete="${s.id}" aria-label="Löschen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    $("#admin-body").innerHTML = html;

    $("#staff-add")?.addEventListener("click", () => this.editStaff());
    $$("#admin-body [data-edit]").forEach((b) =>
      b.addEventListener("click", () => this.editStaff(b.dataset.edit)),
    );
    $$("#admin-body [data-delete]").forEach((b) =>
      b.addEventListener("click", () => this.deleteStaff(b.dataset.delete)),
    );
  },

  async editStaff(id = null) {
    const s = id ? this.staff.find((x) => x.id === id) : null;
    const isNew = !s;

    openModal({
      title: isNew ? "Mitarbeiter hinzufügen" : "Mitarbeiter bearbeiten",
      bodyHTML: `
        <div class="field">
          <label for="staff-name">Name</label>
          <input id="staff-name" type="text" value="${esc(s?.name || "")}" />
        </div>
        <div class="field">
          <label for="staff-role">Rolle</label>
          <select id="staff-role">
            <option value="admin" ${s?.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="service" ${s?.role === 'service' ? 'selected' : ''}>Serviceleitung</option>
            <option value="lager" ${s?.role === 'lager' ? 'selected' : ''}>Lager</option>
            <option value="kasse" ${s?.role === 'kasse' ? 'selected' : ''}>Kasse</option>
          </select>
        </div>
        <div class="field">
          <label for="staff-pin">PIN (4 Ziffern)</label>
          <input id="staff-pin" type="text" maxlength="4" pattern="[0-9]{4}" value="${esc(s?.pin || "")}" />
        </div>
        <div class="field">
          <label>
            <input type="checkbox" id="staff-active" ${s?.is_active ? 'checked' : ''} />
            Aktiv
          </label>
        </div>
      `,
      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" data-save>${isNew ? "Hinzufügen" : "Speichern"}</button>
      `,
      onMount(root) {
        $("[data-save]", root).addEventListener("click", async () => {
          const name = $("#staff-name", root).value.trim();
          const role = $("#staff-role", root).value;
          const pin = $("#staff-pin", root).value.trim();
          const is_active = $("#staff-active", root).checked;

          if (!name) {
            toast("Name darf nicht leer sein", "error");
            return;
          }

          if (!/^[0-9]{4}$/.test(pin)) {
            toast("PIN muss 4 Ziffern sein", "error");
            return;
          }

          try {
            if (isNew) {
              await DB.createStaff({ name, role, pin, is_active });
            } else {
              await DB.updateStaff(s.id, { name, role, pin, is_active });
            }
            closeModal();
            await Admin.loadTab();
            toast(isNew ? "Mitarbeiter hinzugefügt" : "Mitarbeiter gespeichert");
          } catch (err) {
            fail(err);
          }
        });
      },
    });
  },

  async deleteStaff(id) {
    const s = this.staff.find((x) => x.id === id);
    if (!s) return;

    const ok = await confirmDialog(
      "Mitarbeiter löschen?",
      `"${s.name}" wird endgültig gelöscht.`,
      "Löschen",
    );
    if (!ok) return;

    try {
      await DB.deleteStaff(id);
      await this.loadTab();
      toast("Mitarbeiter gelöscht");
    } catch (err) {
      fail(err);
    }
  },

  /* --------------------------------------------------------------------------
     Dienstzeiten
     -------------------------------------------------------------------------- */

  renderShifts() {
    const byStaff = {};
    for (const shift of this.shifts) {
      if (!byStaff[shift.staff_id]) byStaff[shift.staff_id] = [];
      byStaff[shift.staff_id].push(shift);
    }

    let html = `
      <div class="toolbar">
        <span class="muted" style="font-size:var(--text-sm)">
          ${this.shiftRange} Tage · ${this.shifts.length} Schichten
        </span>
      </div>
      <div class="card" style="margin-top:var(--space-4)">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Schichten</th>
                <th class="num">Gesamtzeit</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
    `;

    for (const [staffId, shifts] of Object.entries(byStaff)) {
      const staff = this.staff.find((s) => s.id === staffId);
      const name = staff?.name || 'Unbekannt';
      const totalSeconds = shifts.reduce((acc, s) => {
        const start = new Date(s.started_at).getTime();
        const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
        return acc + (end - start) / 1000;
      }, 0);

      html += `
        <tr>
          <td>${esc(name)}</td>
          <td class="num">${shifts.length}</td>
          <td class="num">${fmtDuration(totalSeconds)}</td>
          <td>
            <button class="btn btn-sm" data-show="${staffId}">Anzeigen</button>
          </td>
        </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    $("#admin-body").innerHTML = html;

    $$("#admin-body [data-show]").forEach((b) =>
      b.addEventListener("click", () => this.showShifts(b.dataset.show)),
    );
  },

  showShifts(staffId) {
    const staff = this.staff.find((s) => s.id === staffId);
    const shifts = this.shifts.filter((s) => s.staff_id === staffId).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));

    let html = `
      <div class="toolbar">
        <button class="btn" data-back>Zurück</button>
        <span class="spacer"></span>
        <span class="muted" style="font-size:var(--text-sm)">${esc(staff?.name || '')}</span>
      </div>
      <div class="card" style="margin-top:var(--space-4)">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Start</th>
                <th>Ende</th>
                <th class="num">Dauer</th>
                <th>Auto</th>
              </tr>
            </thead>
            <tbody>
    `;

    for (const s of shifts) {
      const duration = s.ended_at
        ? fmtDuration((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000)
        : '—';

      html += `
        <tr>
          <td>${fmtDateTime(s.started_at)}</td>
          <td>${s.ended_at ? fmtDateTime(s.ended_at) : '—'}</td>
          <td class="num">${duration}</td>
          <td>${s.ended_auto ? '✅' : '❌'}</td>
        </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    $("#admin-body").innerHTML = html;

    $("[data-back]")?.addEventListener("click", () => {
      this.tab = "dienstzeiten";
      this.loadTab();
    });
  },

  /* --------------------------------------------------------------------------
     Einstellungen
     -------------------------------------------------------------------------- */

  renderSettings() {
    const s = State.settings || {};

    let html = `
      <div class="card">
        <div class="card-head">
          <span class="card-title">Allgemein</span>
        </div>
        <div class="card-body">
          <div class="field">
            <label for="set-name">Name des Geschäfts</label>
            <input id="set-name" type="text" value="${esc(s.shop_name || '')}" />
          </div>
          <div class="field">
            <label for="set-street">Straße</label>
            <input id="set-street" type="text" value="${esc(s.street || '')}" />
          </div>
          <div class="field">
            <label for="set-city">Stadt</label>
            <input id="set-city" type="text" value="${esc(s.city || '')}" />
          </div>
        </div>
        <div class="card-foot">
          <button class="btn btn-primary" id="set-save">Speichern</button>
        </div>
      </div>
    `;

    $("#admin-body").innerHTML = html;

    $("#set-save")?.addEventListener("click", async () => {
      const shop_name = $("#set-name").value.trim();
      const street = $("#set-street").value.trim();
      const city = $("#set-city").value.trim();

      try {
        await DB.updateSettings({ shop_name, street, city });
        State.settings = await DB.getSettings();
        App.paintBrand();
        toast("Einstellungen gespeichert");
      } catch (err) {
        fail(err);
      }
    });
  },

  /* --------------------------------------------------------------------------
     Tagesabschluss
     -------------------------------------------------------------------------- */

  renderClosing(orders) {
    const today = orders.filter((o) => o.status !== 'storniert');
    const revenue = today.reduce((acc, o) => acc + (o.total || 0), 0);
    const cash = today.filter((o) => o.payment_method === 'bar').reduce((acc, o) => acc + (o.total || 0), 0);
    const card = today.filter((o) => o.payment_method === 'karte').reduce((acc, o) => acc + (o.total || 0), 0);

    let html = `
      <div class="stats" style="margin-bottom:var(--space-6)">
        <div class="stat accent">
          <div class="stat-label">Umsatz heute</div>
          <div class="stat-value">${money(revenue)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Bar</div>
          <div class="stat-value">${money(cash)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Karte</div>
          <div class="stat-value">${money(card)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Bestellungen</div>
          <div class="stat-value">${today.length}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">Bestellungen heute</span>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Summe</th>
                <th>Zahlung</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
    `;

    for (const o of today.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))) {
      html += `
        <tr>
          <td>${fmtTime(o.created_at)}</td>
          <td class="num">${money(o.total)}</td>
          <td>${o.payment_method === 'bar' ? 'Bar' : 'Karte'}</td>
          <td>${o.status === 'storniert' ? '<span class="text-error">Storniert</span>' : '✅'}</td>
        </tr>
      `;
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    $("#admin-body").innerHTML = html;
  },

  bind() {
    $("#admin-subnav").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-tab]");
      if (b) {
        this.tab = b.dataset.tab;
        this.paintTabs();
        this.loadTab();
      }
    });
  },
};

window.Admin = Admin;
