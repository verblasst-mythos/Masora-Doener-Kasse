/* ==========================================================================
   Kasse: Produktauswahl, Warenkorb, Zahlung, Bon
   ========================================================================== */
"use strict";

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
    if (!State.category || !cats.includes(State.category)) {
      State.category = cats[0] || null;
    }

    const bar = $("#cat-bar");

    bar.innerHTML = cats
      .map(
        (c) =>
          `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === State.category}">${esc(c)}</button>`,
      )
      .join("");
  },

  /**
   * Wird das Lager für dieses Produkt geführt?
   * Fehlen die Lagerspalten noch in der Datenbank, läuft die Kasse
   * ohne Lagerverwaltung weiter statt alles als ausverkauft anzuzeigen.
   */
  tracksStock(p) {
    return (
      !!p &&
      p.track_stock !== false &&
      p.stock !== undefined &&
      p.stock !== null
    );
  },

  /**
   * Wie viele Stück lassen sich vom Produkt noch in den Warenkorb legen?
   * Bereits im Warenkorb liegende Stück werden abgezogen.
   */
  stockLeft(p) {
    if (!this.tracksStock(p)) return Infinity;

    const line = State.cart.find((l) => l.product_id === p.id);

    return Number(p.stock) - (line ? line.qty : 0);
  },

  renderProducts() {
    const grid = $("#product-grid");

    const list = State.products.filter(
      (p) => p.category === State.category,
    );

    if (!list.length) {
      grid.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
          <p>Keine Produkte in dieser Kategorie. Lege welche in der Verwaltung an.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = list
      .map((p) => {
        const tracked = this.tracksStock(p);
        const left = this.stockLeft(p);
        const out = tracked && left <= 0;
        const low = tracked && !out && left <= Number(p.min_stock ?? 0);

        let badge = "";

        if (out) {
          badge = `<span class="stock-badge out">Ausverkauft</span>`;
        } else if (low) {
          badge = `<span class="stock-badge low">nur noch ${left}</span>`;
        } else if (tracked) {
          badge = `<span class="stock-badge">${left} da</span>`;
        }

        return `
          <button
            class="product${out ? " is-out" : ""}"
            data-add="${p.id}"
            ${out ? " disabled" : ""}
          >
            <span class="product-name">${esc(p.name)}</span>
            <span class="product-meta">
              <span class="product-price">${money(p.price)}</span>
              ${badge}
            </span>
          </button>
        `;
      })
      .join("");
  },

  /* ---------- Warenkorb ---------- */

  add(productId) {
    const p = State.products.find((x) => x.id === productId);

    if (!p) return;

    if (this.stockLeft(p) <= 0) {
      toast(`${p.name} ist ausverkauft`, "error");
      return;
    }

    const line = State.cart.find((l) => l.product_id === p.id);

    if (line) {
      line.qty += 1;
    } else {
      State.cart.push({
        product_id: p.id,
        name: p.name,
        unit_price: Number(p.price),
        qty: 1,
      });
    }

    this.renderCart();
  },

  changeQty(productId, delta) {
    const line = State.cart.find((l) => l.product_id === productId);

    if (!line) return;

    if (delta > 0) {
      const p = State.products.find((x) => x.id === productId);

      if (this.stockLeft(p) <= 0) {
        toast(
          `Mehr als ${line.qty} × ${line.name} sind nicht auf Lager`,
          "error",
        );
        return;
      }
    }

    line.qty += delta;

    if (line.qty <= 0) {
      State.cart = State.cart.filter(
        (l) => l.product_id !== productId,
      );
    }

    this.renderCart();
  },

  removeLine(productId) {
    State.cart = State.cart.filter(
      (l) => l.product_id !== productId,
    );

    this.renderCart();
  },

  clear() {
    State.cart = [];
    State.discountId = "";
    State.coop = null;
    this.renderCart();
  },

  totals() {
    const subtotal = num(
      State.cart.reduce(
        (sum, line) => sum + line.unit_price * line.qty,
        0,
      ),
    );

    const coop = State.coop;
    const discount = State.discounts.find(
      (x) => x.id === State.discountId,
    );

    let discountAmount = 0;
    let discountName = null;
    let discountSource = "rabatt";

    // Kooperation hat Vorrang vor einem normalen Rabatt.
    if (coop) {
      discountAmount =
        coop.kind === "percent"
          ? num((subtotal * Number(coop.value)) / 100)
          : num(coop.value);

      discountName = coop.name;
      discountSource = "kooperation";
    } else if (discount) {
      discountAmount =
        discount.kind === "percent"
          ? num((subtotal * Number(discount.value)) / 100)
          : num(discount.value);

      discountName = discount.name;
    }

    discountAmount = Math.min(discountAmount, subtotal);

    const total = num(subtotal - discountAmount);
    const vatRate = Number(State.settings?.vat_rate ?? 19);
    const vat = num(total - total / (1 + vatRate / 100));

    return {
      subtotal,
      discount: discountAmount,
      total,
      discountName,
      discountSource,
      vat,
      vatRate,
    };
  },

  /* ---------- Kooperation per Codewort freischalten ---------- */

  renderCoop() {
    const box = $("#coop-box");

    if (!box) return;

    const coop = State.coop;

    if (coop) {
      const value =
        coop.kind === "percent"
          ? `${Number(coop.value)} %`
          : money(coop.value);

      box.innerHTML = `
        <div class="coop-active">
          <span class="tag ok">Kooperation</span>
          <span class="coop-name">${esc(coop.name)} · ${value}</span>
          <button class="btn btn-sm btn-ghost" id="coop-clear">
            Entfernen
          </button>
        </div>
      `;

      $("#coop-clear").addEventListener("click", () => {
        State.coop = null;
        toast("Kooperation entfernt");
        this.renderCart();
      });
    } else {
      box.innerHTML = `
        <div class="coop-form">
          <input
            class="input"
            id="coop-code"
            placeholder="Codewort"
            autocomplete="off"
            aria-label="Codewort für Kooperation"
          >
          <button class="btn btn-sm" id="coop-apply">
            Prüfen
          </button>
        </div>
      `;

      const input = $("#coop-code");

      const apply = () => this.applyCoop(input.value);

      $("#coop-apply").addEventListener("click", apply);

      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          apply();
        }
      });
    }
  },

  async applyCoop(code) {
    const clean = String(code || "").trim();

    if (!clean) {
      toast("Bitte ein Codewort eingeben", "error");
      return;
    }

    const btn = $("#coop-apply");

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Prüfe …";
    }

    try {
      const coop = await DB.findCoopByCode(clean);

      if (!coop) {
        toast("Codewort nicht erkannt", "error");

        if (btn) {
          btn.disabled = false;
          btn.textContent = "Prüfen";
        }

        return;
      }

      State.coop = coop;
      State.discountId = "";

      const value =
        coop.kind === "percent"
          ? `${Number(coop.value)} %`
          : money(coop.value);

      toast(`${coop.name} freigeschaltet — ${value}`);

      this.renderCart();
    } catch (err) {
      fail(err);

      if (btn) {
        btn.disabled = false;
        btn.textContent = "Prüfen";
      }
    }
  },

  renderCart() {
    const items = $("#cart-items");

    const count = State.cart.reduce(
      (sum, line) => sum + line.qty,
      0,
    );

    $("#cart-count").textContent = count;

    if (!State.cart.length) {
      items.innerHTML = `
        <div class="empty">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 6h18l-1.6 11.2A2 2 0 0 1 17.4 19H6.6a2 2 0 0 1-2-1.8L3 6z"/>
            <path d="M8 6V4.5A3.5 3.5 0 0 1 15 4.5V6"/>
          </svg>
          <p>Noch nichts gewählt. Tippe links auf ein Produkt.</p>
        </div>
      `;
    } else {
      items.innerHTML = State.cart
        .map(
          (line) => `
            <div class="cart-row">
              <div>
                <div class="cart-row-name">${esc(line.name)}</div>
                <div class="cart-row-unit">
                  ${money(line.unit_price)} / Stück
                </div>
              </div>

              <div class="cart-row-total">
                ${money(line.unit_price * line.qty)}
              </div>

              <div class="qty">
                <button
                  data-minus="${line.product_id}"
                  aria-label="Weniger ${esc(line.name)}"
                >
                  &minus;
                </button>

                <span class="qty-value">${line.qty}</span>

                <button
                  data-plus="${line.product_id}"
                  aria-label="Mehr ${esc(line.name)}"
                >
                  +
                </button>

                <span class="spacer"></span>

                <button
                  data-remove="${line.product_id}"
                  aria-label="${esc(line.name)} entfernen"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>
                  </svg>
                </button>
              </div>
            </div>
          `,
        )
        .join("");
    }

    const select = $("#discount-select");

    select.innerHTML =
      `<option value="">Kein Rabatt</option>` +
      State.discounts
        .map(
          (discount) =>
            `<option value="${discount.id}" ${
              discount.id === State.discountId ? "selected" : ""
            }>${esc(discount.name)}</option>`,
        )
        .join("");

    // Bei aktiver Kooperation ist der normale Rabatt gesperrt.
    select.disabled = !!State.coop;

    this.renderCoop();
    this.renderProducts();

    const t = this.totals();

    $("#sum-subtotal").textContent = money(t.subtotal);

    $("#row-discount").classList.toggle(
      "hidden",
      t.discount <= 0,
    );

    $("#label-discount").textContent =
      t.discountSource === "kooperation"
        ? "Kooperation"
        : "Rabatt";

    $("#sum-discount").textContent = "− " + money(t.discount);
    $("#sum-total").textContent = money(t.total);
    $("#sum-vat").textContent = `${money(t.vat)} (${t.vatRate}%)`;

    const disabled = State.cart.length === 0;

    $("#pay-cash").disabled = disabled;
    $("#pay-card").disabled = disabled;
    $("#cart-clear").disabled = disabled;
  },

  /* ---------- Zahlung ---------- */

  openPayment(method) {
    if (!State.cart.length) return;

    // Ohne Dienst wird nicht kassiert.
    if (!Duty.requireDuty()) return;

    const t = this.totals();
    const isCash = method === "bar";

    openModal({
      title: isCash ? "Barzahlung" : "Kartenzahlung",

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
                <input
                  class="input"
                  id="cash-given"
                  type="number"
                  step="0.01"
                  min="0"
                  inputmode="decimal"
                  value="${t.total.toFixed(2)}"
                >
              </div>

              <div class="quick-cash" id="quick-cash">
                <button class="btn btn-sm" data-cash="exact">Passend</button>
                <button class="btn btn-sm" data-cash="10">10 €</button>
                <button class="btn btn-sm" data-cash="20">20 €</button>
                <button class="btn btn-sm" data-cash="50">50 €</button>
              </div>

              <div class="change-box" id="change-box">
                <span class="change-label">Rückgeld</span>
                <span class="change-value" id="change-value">
                  ${money(0)}
                </span>
              </div>
            `
            : `
              <p class="muted" style="font-size:var(--text-sm)">
                Betrag am Kartenterminal eingeben und die Zahlung dort abschließen.
              </p>
            `
        }
      `,

      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" id="confirm-pay">
          Kassieren
        </button>
      `,

      onMount: (root) => {
        const confirmBtn = $("#confirm-pay", root);

        if (isCash) {
          const input = $("#cash-given", root);
          const box = $("#change-box", root);
          const out = $("#change-value", root);

          const update = () => {
            const given = Number(input.value);
            const change = num(given - t.total);

            out.textContent = money(Math.max(change, 0));

            const short =
              !Number.isFinite(given) ||
              change < -0.0001;

            box.classList.toggle("negative", short);

            $(".change-label", box).textContent = short
              ? "Es fehlt"
              : "Rückgeld";

            if (short) {
              out.textContent = money(Math.abs(change));
            }

            confirmBtn.disabled = short;
          };

          input.addEventListener("input", update);

          $("#quick-cash", root).addEventListener("click", (event) => {
            const button = event.target.closest("button[data-cash]");

            if (!button) return;

            input.value =
              button.dataset.cash === "exact"
                ? t.total.toFixed(2)
                : Number(button.dataset.cash).toFixed(2);

            update();
          });

          update();

          setTimeout(() => input.select(), 60);

          confirmBtn.addEventListener("click", () => {
            this.finish(method, Number(input.value), t);
          });
        } else {
          confirmBtn.addEventListener("click", () => {
            this.finish(method, null, t);
          });
        }
      },
    });
  },

  /*
    Zahlung erfolgreich abschließen:

    1. Bestellung in der Datenbank speichern.
    2. Bestellung an den Cloudflare Worker senden.
    3. Cloudflare Worker sendet die Quittung an Discord.
    4. Kasse zurücksetzen und Bon anzeigen.
  */
  async finish(method, cashGiven, t) {
    const btn = $("#confirm-pay");

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Speichern …";
    }

    try {
      /*
        Bestellung in der Datenbank speichern.
      */
      const order = await DB.placeOrder({
        items: State.cart.map((line) => ({
          product_id: line.product_id,
          name: line.name,
          unit_price: line.unit_price,
          qty: line.qty,
          line_total: num(line.unit_price * line.qty),
        })),

        subtotal: t.subtotal,
        discount_name: t.discountName,
        discount_amount: t.discount,
        discount_source: t.discountSource,
        total: t.total,

        payment_method: method,

        cash_given:
          method === "bar"
            ? num(cashGiven)
            : null,

        change_due:
          method === "bar"
            ? num(cashGiven - t.total)
            : null,

        staff_id: State.user?.id || null,
        staff_name: State.user?.name || null,
        shift_id: State.shift?.id || null,
      });

      /*
        Discord-Nachricht verschicken.

        Das passiert vor this.clear(), weil der Warenkorb danach leer ist.
        Sollte Cloudflare oder Discord ausfallen, bleibt die Bestellung trotzdem
        in der Datenbank gespeichert und die Kasse läuft normal weiter.
      */
      try {
        await window.sendReceiptToDiscord({
          ...order,

          // Bestellnummer für Discord:
          orderId: order.order_no || order.id || "Unbekannt",

          // Deine Kasse hat aktuell kein Kundenfeld, daher "Gast".
          customerName: "Gast",

          // Gesamtbetrag:
          total: order.total ?? t.total,

          // Währung:
          currency: "EUR",

          // Aktueller Kassierer:
          staffName:
            State.user?.name ||
            order.staff_name ||
            "Unbekannt",

          /*
            Artikel für Discord.
            Das Cloudflare-Script erwartet:
            { name, quantity, price }
          */
          items: State.cart.map((line) => ({
            name: line.name,
            quantity: line.qty,
            price: line.unit_price,
          })),
        });
      } catch (discordError) {
        /*
          Discord-Fehler nur protokollieren:
          Die Bestellung wurde bereits erfolgreich gespeichert.
        */
        console.error(
          "Discord-Quittung konnte nicht gesendet werden:",
          discordError,
        );

        toast(
          "Bestellung gespeichert, aber Discord-Quittung konnte nicht gesendet werden.",
          "error",
        );
      }

      /*
        Erst nach dem Discord-Versand Warenkorb leeren
        und den normalen Bon anzeigen.
      */
      closeModal();

      this.clear();

      toast(
        `Bestellung #${order.order_no} gespeichert — ${money(order.total)}`,
      );

      Receipt.show(order);

      // Bestandszahlen an der Kasse aktualisieren.
      this.reloadStock();
    } catch (err) {
      fail(err);

      if (btn) {
        btn.disabled = false;
        btn.textContent = "Kassieren";
      }
    }
  },

  /** Lädt Produkte neu, damit die Bestandszahlen aktuell bleiben. */
  async reloadStock() {
    try {
      State.products = await DB.listProducts(true);
      this.renderProducts();
    } catch (err) {
      console.error(err);
    }
  },

  /* ---------- Events ---------- */

  bind() {
    $("#cat-bar").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-cat]");

      if (!button) return;

      State.category = button.dataset.cat;

      this.renderCategories();
      this.renderProducts();
    });

    $("#product-grid").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-add]");

      if (button) {
        this.add(button.dataset.add);
      }
    });

    $("#cart-items").addEventListener("click", (event) => {
      const plus = event.target.closest("button[data-plus]");
      const minus = event.target.closest("button[data-minus]");
      const remove = event.target.closest("button[data-remove]");

      if (plus) {
        this.changeQty(plus.dataset.plus, 1);
      } else if (minus) {
        this.changeQty(minus.dataset.minus, -1);
      } else if (remove) {
        this.removeLine(remove.dataset.remove);
      }
    });

    $("#discount-select").addEventListener("change", (event) => {
      State.discountId = event.target.value;
      this.renderCart();
    });

    $("#cart-clear").addEventListener("click", async () => {
      const ok = await confirmDialog(
        "Warenkorb leeren?",
        "Alle Positionen werden verworfen.",
        "Leeren",
      );

      if (ok) {
        this.clear();
      }
    });

    $("#pay-cash").addEventListener("click", () => {
      this.openPayment("bar");
    });

    $("#pay-card").addEventListener("click", () => {
      this.openPayment("karte");
    });
  },
};

/* ==========================================================================
   Bon / Kassenzettel
   ========================================================================== */

const Receipt = {
  build(order) {
    const s = State.settings || {};
    const W = 40;

    const line = (leftText, rightText) => {
      const left = String(leftText);
      const right = String(rightText);
      const gap = Math.max(1, W - left.length - right.length);

      return left + " ".repeat(gap) + right;
    };

    const rule = (character = "-") => character.repeat(W);

    const center = (text) => {
      const value = String(text);
      const padding = Math.max(
        0,
        Math.floor((W - value.length) / 2),
      );

      return " ".repeat(padding) + value;
    };

    const out = [];

    out.push(
      center((s.shop_name || "Masora Döner").toUpperCase()),
    );

    if (s.address) {
      out.push(center(s.address));
    }

    if (s.phone) {
      out.push(center("Tel. " + s.phone));
    }

    if (s.tax_id) {
      out.push(center("St.-Nr. " + s.tax_id));
    }

    out.push("");

    out.push(
      line(
        "Bon #" + order.order_no,
        fmtDateTime(order.created_at),
      ),
    );

    if (order.staff_name) {
      out.push("Bedienung: " + order.staff_name);
    }

    if (order.status === "storniert") {
      out.push("");
      out.push(center("*** STORNIERT ***"));
    }

    out.push(rule("="));

    (order.items || []).forEach((item) => {
      out.push(
        line(
          `${item.qty}x ${item.name}`,
          money(item.line_total),
        ),
      );

      if (item.qty > 1) {
        out.push("    " + money(item.unit_price) + " / Stück");
      }
    });

    out.push(rule("-"));

    out.push(line("Zwischensumme", money(order.subtotal)));

    if (Number(order.discount_amount) > 0) {
      const type =
        order.discount_source === "kooperation"
          ? "Kooperation"
          : "Rabatt";

      out.push(
        line(
          type +
            (order.discount_name
              ? " (" + order.discount_name + ")"
              : ""),
          "-" + money(order.discount_amount),
        ),
      );
    }

    out.push(rule("="));
    out.push(line("SUMME", money(order.total)));

    const rate = Number(s.vat_rate ?? 19);
    const total = Number(order.total);

    const vat = num(total - total / (1 + rate / 100));

    out.push(
      line(
        `enthaltene MwSt. ${rate}%`,
        money(vat),
      ),
    );

    out.push("");

    out.push(
      line(
        "Zahlung",
        order.payment_method === "bar" ? "Bar" : "Karte",
      ),
    );

    if (
      order.payment_method === "bar" &&
      order.cash_given != null
    ) {
      out.push(line("Gegeben", money(order.cash_given)));
      out.push(line("Rückgeld", money(order.change_due)));
    }

    out.push("");

    if (s.receipt_footer) {
      out.push(center(s.receipt_footer));
    }

    return out.join("\n");
  },

  show(order) {
    const text = this.build(order);

    openModal({
      title: "Bon #" + order.order_no,

      bodyHTML: `
        <div class="receipt" id="receipt-text">
          ${esc(text)}
        </div>
      `,

      footHTML: `
        <button class="btn" data-close>Schließen</button>
        <button class="btn btn-primary" id="print-receipt">
          Drucken
        </button>
      `,

      onMount(root) {
        $("#print-receipt", root).addEventListener("click", () => {
          window.print();
        });
      },
    });
  },
};

window.Kasse = Kasse;
window.Receipt = Receipt;
