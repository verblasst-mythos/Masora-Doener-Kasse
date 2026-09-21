/* ==========================================================================
   Verwaltung: Produkte, Lager, Rabatte, Kooperationen, Personal,
   Dienstzeiten, Einstellungen, Tagesabschluss
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
  shiftRange: 7,

  open() {
    const role =
      State.userRole ||
      State.user?.role ||
      "kasse";

    const allowedTabs = {
      produkte: ["admin", "service", "lager"],
      lager: ["admin", "lager"],
      rabatte: ["admin"],
      kooperationen: ["admin"],
      personal: ["admin"],
      dienstzeiten: ["admin", "service"],
      einstellungen: ["admin"],
      abschluss: ["admin"],
    };

    $$("#admin-subnav button").forEach((button) => {
      const tab = button.dataset.tab;
      const allowed = allowedTabs[tab] || ["admin"];

      button.classList.toggle(
        "hidden",
        !allowed.includes(role),
      );
    });

    const firstVisible = $(
      "#admin-subnav button:not(.hidden)",
    );

    if (
      !firstVisible ||
      !allowedTabs[firstVisible.dataset.tab]?.includes(role)
    ) {
      this.tab = "produkte";
    } else {
      this.tab = firstVisible.dataset.tab;
    }

    this.paintTabs();
    this.loadTab();
  },

  paintTabs() {
    $$("#admin-subnav button").forEach((button) => {
      button.setAttribute(
        "aria-current",
        String(button.dataset.tab === this.tab),
      );
    });
  },

  busy(text = "Lade …") {
    const body = $("#admin-body");

    if (body) {
      body.innerHTML = `
        <p
          class="muted"
          style="font-size:var(--text-sm)"
        >
          ${esc(text)}
        </p>
      `;
    }
  },

  async loadTab() {
    this.busy();

    try {
      if (this.tab === "produkte") {
        this.products = await DB.listProducts(false);
        this.renderProducts();
      } else if (this.tab === "lager") {
        const result = await Promise.all([
          DB.listProducts(false),
          DB.listStockMoves({ limit: 40 }),
        ]);

        this.products = result[0];
        this.moves = result[1];
        this.renderStock();
      } else if (this.tab === "rabatte") {
        this.discounts = await DB.listDiscounts(false);
        this.renderDiscounts();
      } else if (this.tab === "kooperationen") {
        this.coops = await DB.listCoops(false);
        this.renderCoops();
      } else if (this.tab === "personal") {
        this.staff = await DB.listStaff(false);
        this.renderStaff();
      } else if (this.tab === "dienstzeiten") {
        const from = startOfDay(
          -(this.shiftRange - 1),
        ).toISOString();

        const result = await Promise.all([
          DB.listShifts({ from }),
          DB.listStaff(false),
        ]);

        this.shifts = result[0];
        this.staff = result[1];
        this.renderShifts();
      } else if (this.tab === "einstellungen") {
        State.settings = await DB.getSettings();

        if (
          window.App &&
          typeof App.paintBrand === "function"
        ) {
          App.paintBrand();
        }

        if (
          window.App &&
          typeof App.paintTheme === "function"
        ) {
          App.paintTheme();
        }

        if (
          window.App &&
          typeof App.paintLogo === "function"
        ) {
          App.paintLogo();
        }

        this.renderSettings();
      } else if (this.tab === "abschluss") {
        const orders = await DB.listOrders({
          from: startOfDay(0).toISOString(),
        });

        this.renderClosing(orders);
      }
    } catch (error) {
      fail(error);

      const body = $("#admin-body");

      if (body) {
        body.innerHTML = `
          <p
            class="muted"
            style="font-size:var(--text-sm)"
          >
            Konnte nicht geladen werden.
          </p>
        `;
      }
    }
  },

  /* ------------------------------------------------------------------------
     Produkte
     ------------------------------------------------------------------------ */

  renderProducts() {
    let html = `
      <div class="toolbar">
        <button
          class="btn btn-primary"
          id="prod-add"
          type="button"
        >
          + Produkt
        </button>

        <span class="spacer"></span>

        <span
          class="muted"
          style="font-size:var(--text-sm)"
        >
          ${this.products.length} Produkte
        </span>
      </div>

      <div
        class="card"
        style="margin-top:var(--space-4)"
      >
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

    for (const product of this.products) {
      const vatRate =
        Number(product.vat_rate || 0) * 100;

      const stockInfo = product.track_stock
        ? `
          <span class="${
            product.stock <= product.min_stock
              ? "text-error"
              : "muted"
          }">
            ${product.stock} / ${product.min_stock}
          </span>
        `
        : `<span class="muted">—</span>`;

      html += `
        <tr>
          <td>${esc(product.name)}</td>
          <td>${esc(product.category || "Sonstiges")}</td>
          <td class="num">${money(product.price)}</td>
          <td class="num">${vatRate.toFixed(0)} %</td>
          <td>${stockInfo}</td>

          <td class="actions">
            <button
              class="icon-btn"
              type="button"
              data-product-edit="${esc(product.id)}"
              aria-label="Bearbeiten"
            >
              ✎
            </button>

            <button
              class="icon-btn"
              type="button"
              data-product-delete="${esc(product.id)}"
              aria-label="Löschen"
            >
              ×
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

    $("#prod-add")?.addEventListener(
      "click",
      () => this.editProduct(),
    );

    $$("#admin-body [data-product-edit]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          this.editProduct(
            button.dataset.productEdit,
          );
        });
      },
    );

    $$("#admin-body [data-product-delete]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          this.deleteProduct(
            button.dataset.productDelete,
          );
        });
      },
    );
  },

  async editProduct(id = null) {
    const product = id
      ? this.products.find(
          (item) => String(item.id) === String(id),
        )
      : null;

    const isNew = !product;

    openModal({
      title: isNew
        ? "Produkt hinzufügen"
        : "Produkt bearbeiten",

      bodyHTML: `
        <div class="field">
          <label for="prod-name">Name</label>
          <input
            id="prod-name"
            type="text"
            value="${esc(product?.name || "")}"
          />
        </div>

        <div class="field">
          <label for="prod-cat">Kategorie</label>
          <input
            id="prod-cat"
            type="text"
            value="${esc(product?.category || "")}"
          />
        </div>

        <div class="field">
          <label for="prod-price">Preis (€)</label>
          <input
            id="prod-price"
            type="number"
            step="0.01"
            value="${product?.price ?? ""}"
          />
        </div>

        <div class="field">
          <label for="prod-vat">MwSt. (%)</label>
          <input
            id="prod-vat"
            type="number"
            step="0.1"
            value="${
              Number(product?.vat_rate || 0) * 100
            }"
          />
        </div>

        <div class="field">
          <label for="prod-stock">Lagerbestand</label>
          <input
            id="prod-stock"
            type="number"
            step="0.01"
            value="${product?.stock ?? 0}"
          />
        </div>

        <div class="field">
          <label for="prod-minstock">
            Mindestbestand
          </label>
          <input
            id="prod-minstock"
            type="number"
            step="0.01"
            value="${product?.min_stock ?? 0}"
          />
        </div>

        <div class="field">
          <label>
            <input
              type="checkbox"
              id="prod-track"
              ${product?.track_stock ? "checked" : ""}
            />
            Lagerverwaltung aktivieren
          </label>
        </div>
      `,

      footHTML: `
        <button
          class="btn"
          type="button"
          data-close
        >
          Abbrechen
        </button>

        <button
          class="btn btn-primary"
          type="button"
          data-save
        >
          ${isNew ? "Hinzufügen" : "Speichern"}
        </button>
      `,

      onMount(root) {
        $("[data-save]", root)?.addEventListener(
          "click",
          async () => {
            const name =
              $("#prod-name", root).value.trim();

            const category =
              $("#prod-cat", root).value.trim() ||
              "Sonstiges";

            const price =
              parseFloat(
                $("#prod-price", root).value,
              ) || 0;

            const vat_rate =
              (parseFloat(
                $("#prod-vat", root).value,
              ) || 0) / 100;

            const stock =
              parseFloat(
                $("#prod-stock", root).value,
              ) || 0;

            const min_stock =
              parseFloat(
                $("#prod-minstock", root).value,
              ) || 0;

            const track_stock =
              $("#prod-track", root).checked;

            if (!name) {
              toast(
                "Name darf nicht leer sein",
                "error",
              );
              return;
            }

            try {
              const data = {
                name,
                category,
                price,
                vat_rate,
                stock,
                min_stock,
                track_stock,
              };

              if (isNew) {
                await DB.createProduct(data);
              } else {
                await DB.updateProduct(
                  product.id,
                  data,
                );
              }

              closeModal();
              await Admin.loadTab();

              toast(
                isNew
                  ? "Produkt hinzugefügt"
                  : "Produkt gespeichert",
              );
            } catch (error) {
              fail(error);
            }
          },
        );
      },
    });
  },

  async deleteProduct(id) {
    const product = this.products.find(
      (item) => String(item.id) === String(id),
    );

    if (!product) {
      return;
    }

    const confirmed = await confirmDialog(
      "Produkt löschen?",
      `"${product.name}" wird endgültig gelöscht.`,
      "Löschen",
    );

    if (!confirmed) {
      return;
    }

    try {
      await DB.deleteProduct(id);
      await this.loadTab();
      toast("Produkt gelöscht");
    } catch (error) {
      fail(error);
    }
  },

  /* ------------------------------------------------------------------------
     Lager
     ------------------------------------------------------------------------ */

  renderStock() {
    const trackedProducts =
      this.products.filter(
        (product) => product.track_stock,
      );

    let html = `
      <div class="toolbar">
        <button
          class="btn btn-primary"
          id="stock-add"
          type="button"
        >
          + Wareneingang
        </button>

        <button
          class="btn btn-warn"
          id="stock-warn"
          type="button"
        >
          ⚠️ Warnung senden
        </button>

        <span class="spacer"></span>

        <span
          class="muted"
          style="font-size:var(--text-sm)"
        >
          ${trackedProducts.length} Lagerprodukte
        </span>
      </div>

      <div
        class="card"
        style="margin-top:var(--space-4)"
      >
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

    for (const product of trackedProducts) {
      const lastMove = this.moves.find(
        (move) =>
          String(move.product_id) ===
          String(product.id),
      );

      let status = "";

      if (product.stock <= 0) {
        status =
          '<span class="text-error">Ausverkauft</span>';
      } else if (product.stock <= product.min_stock) {
        status =
          '<span class="text-warn">Niedrig</span>';
      } else {
        status =
          '<span class="text-success">OK</span>';
      }

      html += `
        <tr>
          <td>${esc(product.name)}</td>
          <td class="num">${product.stock}</td>
          <td class="num">${product.min_stock}</td>
          <td>${status}</td>
          <td>
            ${
              lastMove
                ? fmtDateTime(lastMove.created_at)
                : "—"
            }
          </td>

          <td class="actions">
            <button
              class="icon-btn"
              type="button"
              data-stock-adjust="${esc(product.id)}"
              aria-label="Bestand anpassen"
            >
              +
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

    $("#stock-add")?.addEventListener(
      "click",
      () => this.adjustStock(),
    );

    $("#stock-warn")?.addEventListener(
      "click",
      () => this.checkStockAndWarn(true),
    );

    $$("#admin-body [data-stock-adjust]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          this.adjustStock(
            button.dataset.stockAdjust,
          );
        });
      },
    );
  },

  async adjustStock(productId = null) {
    const products =
      this.products.filter(
        (product) => product.track_stock,
      );

    const selected = productId
      ? products.find(
          (product) =>
            String(product.id) ===
            String(productId),
        )
      : products[0];

    if (!selected) {
      toast(
        "Keine Produkte mit Lagerverwaltung",
        "error",
      );
      return;
    }

    openModal({
      title: "Lagerbestand anpassen",

      bodyHTML: `
        <div class="field">
          <label for="adj-product">Produkt</label>
          <select id="adj-product">
            ${products
              .map(
                (product) => `
                  <option
                    value="${esc(product.id)}"
                    ${
                      String(product.id) ===
                      String(selected.id)
                        ? "selected"
                        : ""
                    }
                  >
                    ${esc(product.name)}
                    (${product.stock})
                  </option>
                `,
              )
              .join("")}
          </select>
        </div>

        <div class="field">
          <label for="adj-delta">
            Änderung (+/-)
          </label>
          <input
            id="adj-delta"
            type="number"
            step="0.01"
            value="0"
          />
        </div>

        <div class="field">
          <label for="adj-reason">Grund</label>
          <select id="adj-reason">
            <option value="wareneingang">
              Wareneingang
            </option>
            <option value="korrektur">
              Korrektur
            </option>
            <option value="schwund">
              Schwund
            </option>
          </select>
        </div>
      `,

      footHTML: `
        <button
          class="btn"
          type="button"
          data-close
        >
          Abbrechen
        </button>

        <button
          class="btn btn-primary"
          type="button"
          data-save
        >
          Buchen
        </button>
      `,

      onMount(root) {
        $("[data-save]", root)?.addEventListener(
          "click",
          async () => {
            const productId =
              $("#adj-product", root).value;

            const delta =
              parseFloat(
                $("#adj-delta", root).value,
              ) || 0;

            const reason =
              $("#adj-reason", root).value;

            if (delta === 0) {
              toast(
                "Änderung darf nicht 0 sein",
                "error",
              );
              return;
            }

            try {
              await DB.adjustStock(
                productId,
                delta,
                reason,
                State.user?.name || "Unbekannt",
              );

              closeModal();
              await Admin.loadTab();
              toast("Lagerbestand aktualisiert");
            } catch (error) {
              fail(error);
            }
          },
        );
      },
    });
  },

  async checkStockAndWarn(showToast = false) {
    try {
      const products =
        await DB.listProducts(false);

      const lowStock = products.filter(
        (product) =>
          product.track_stock &&
          product.stock <= product.min_stock,
      );

      if (!lowStock.length) {
        if (showToast) {
          toast("Lager ist im grünen Bereich");
        }
        return;
      }

      const response = await fetch(
        "https://masora-doener-kasse-worker.finnwoschech.workers.dev/stock-warning",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            products: lowStock.map((product) => ({
              name: product.name,
              stock: product.stock,
              min_stock: product.min_stock,
            })),
            staffName:
              State.user?.name || "System",
          }),
        },
      );

      const result = await response
        .json()
        .catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error ||
            "Lager-Warnung konnte nicht gesendet werden",
        );
      }

      if (showToast) {
        toast(
          `Lager-Warnung gesendet (${lowStock.length} Produkte)`,
        );
      }
    } catch (error) {
      console.error(
        "Lager-Warnung:",
        error,
      );

      if (showToast) {
        fail(error);
      }
    }
  },

  /* ------------------------------------------------------------------------
     Rabatte
     ------------------------------------------------------------------------ */

  renderDiscounts() {
    let html = `
      <div class="toolbar">
        <button
          class="btn btn-primary"
          id="disc-add"
          type="button"
        >
          + Rabatt
        </button>

        <span class="spacer"></span>

        <span
          class="muted"
          style="font-size:var(--text-sm)"
        >
          ${this.discounts.length} Rabatte
        </span>
      </div>

      <div
        class="card"
        style="margin-top:var(--space-4)"
      >
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

    for (const discount of this.discounts) {
      const kind =
        discount.kind === "percent"
          ? "Prozent"
          : "Euro";

      const value =
        discount.kind === "percent"
          ? `${discount.value}%`
          : money(discount.value);

      html += `
        <tr>
          <td>${esc(discount.name)}</td>
          <td>${kind}</td>
          <td class="num">${value}</td>

          <td class="actions">
            <button
              class="icon-btn"
              type="button"
              data-discount-edit="${esc(discount.id)}"
              aria-label="Bearbeiten"
            >
              ✎
            </button>

            <button
              class="icon-btn"
              type="button"
              data-discount-delete="${esc(discount.id)}"
              aria-label="Löschen"
            >
              ×
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

    $("#disc-add")?.addEventListener(
      "click",
      () => this.editDiscount(),
    );

    $$("#admin-body [data-discount-edit]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          this.editDiscount(
            button.dataset.discountEdit,
          );
        });
      },
    );

    $$("#admin-body [data-discount-delete]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          this.deleteDiscount(
            button.dataset.discountDelete,
          );
        });
      },
    );
  },

  async editDiscount(id = null) {
    const discount = id
      ? this.discounts.find(
          (item) =>
            String(item.id) === String(id),
        )
      : null;

    const isNew = !discount;

    openModal({
      title: isNew
        ? "Rabatt hinzufügen"
        : "Rabatt bearbeiten",

      bodyHTML: `
        <div class="field">
          <label for="disc-name">Name</label>
          <input
            id="disc-name"
            type="text"
            value="${esc(discount?.name || "")}"
          />
        </div>

        <div class="field">
          <label for="disc-kind">Art</label>
          <select id="disc-kind">
            <option
              value="percent"
              ${
                discount?.kind === "percent"
                  ? "selected"
                  : ""
              }
            >
              Prozent (%)
            </option>

            <option
              value="fixed"
              ${
                discount?.kind === "fixed"
                  ? "selected"
                  : ""
              }
            >
              Fester Betrag (€)
            </option>
          </select>
        </div>

        <div class="field">
          <label for="disc-value">Wert</label>
          <input
            id="disc-value"
            type="number"
            step="0.01"
            value="${discount?.value ?? ""}"
          />
        </div>
      `,

      footHTML: `
        <button
          class="btn"
          type="button"
          data-close
        >
          Abbrechen
        </button>

        <button
          class="btn btn-primary"
          type="button"
          data-save
        >
          ${isNew ? "Hinzufügen" : "Speichern"}
        </button>
      `,

      onMount(root) {
        $("[data-save]", root)?.addEventListener(
          "click",
          async () => {
            const name =
              $("#disc-name", root).value.trim();

            const kind =
              $("#disc-kind", root).value;

            const value =
              parseFloat(
                $("#disc-value", root).value,
              ) || 0;

            if (!name) {
              toast(
                "Name darf nicht leer sein",
                "error",
              );
              return;
            }

            try {
              const data = {
                name,
                kind,
                value,
              };

              if (isNew) {
                await DB.createDiscount(data);
              } else {
                await DB.updateDiscount(
                  discount.id,
                  data,
                );
              }

              closeModal();
              await Admin.loadTab();

              toast(
                isNew
                  ? "Rabatt hinzugefügt"
                  : "Rabatt gespeichert",
              );
            } catch (error) {
              fail(error);
            }
          },
        );
      },
    });
  },

  async deleteDiscount(id) {
    const discount = this.discounts.find(
      (item) =>
        String(item.id) === String(id),
    );

    if (!discount) {
      return;
    }

    const confirmed = await confirmDialog(
      "Rabatt löschen?",
      `"${discount.name}" wird endgültig gelöscht.`,
      "Löschen",
    );

    if (!confirmed) {
      return;
    }

    try {
      await DB.deleteDiscount(id);
      await this.loadTab();
      toast("Rabatt gelöscht");
    } catch (error) {
      fail(error);
    }
  },

  /* ------------------------------------------------------------------------
     Kooperationen
     ------------------------------------------------------------------------ */

  renderCoops() {
    let html = `
      <div class="toolbar">
        <button
          class="btn btn-primary"
          id="coop-add"
          type="button"
        >
          + Kooperation
        </button>

        <span class="spacer"></span>

        <span
          class="muted"
          style="font-size:var(--text-sm)"
        >
          ${this.coops.length} Kooperationen
        </span>
      </div>

      <div
        class="card"
        style="margin-top:var(--space-4)"
      >
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

    for (const coop of this.coops) {
      const kind =
        coop.kind === "percent"
          ? "Prozent"
          : "Euro";

      const value =
        coop.kind === "percent"
          ? `${coop.value}%`
          : money(coop.value);

      html += `
        <tr>
          <td>${esc(coop.name)}</td>
          <td>${kind}</td>
          <td class="num">${value}</td>
          <td><code>${esc(coop.code)}</code></td>
          <td>${coop.is_active ? "✅" : "❌"}</td>

          <td class="actions">
            <button
              class="icon-btn"
              type="button"
              data-coop-edit="${esc(coop.id)}"
              aria-label="Bearbeiten"
            >
              ✎
            </button>

            <button
              class="icon-btn"
              type="button"
              data-coop-delete="${esc(coop.id)}"
              aria-label="Löschen"
            >
              ×
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

    $("#coop-add")?.addEventListener(
      "click",
      () => this.editCoop(),
    );

    $$("#admin-body [data-coop-edit]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          this.editCoop(
            button.dataset.coopEdit,
          );
        });
      },
    );

    $$("#admin-body [data-coop-delete]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          this.deleteCoop(
            button.dataset.coopDelete,
          );
        });
      },
    );
  },

  async editCoop(id = null) {
    const coop = id
      ? this.coops.find(
          (item) =>
            String(item.id) === String(id),
        )
      : null;

    const isNew = !coop;

    openModal({
      title: isNew
        ? "Kooperation hinzufügen"
        : "Kooperation bearbeiten",

      bodyHTML: `
        <div class="field">
          <label for="coop-name">Name</label>
          <input
            id="coop-name"
            type="text"
            value="${esc(coop?.name || "")}"
          />
        </div>

        <div class="field">
          <label for="coop-kind">Art</label>
          <select id="coop-kind">
            <option
              value="percent"
              ${
                coop?.kind === "percent"
                  ? "selected"
                  : ""
              }
            >
              Prozent (%)
            </option>

            <option
              value="fixed"
              ${
                coop?.kind === "fixed"
                  ? "selected"
                  : ""
              }
            >
              Fester Betrag (€)
            </option>
          </select>
        </div>

        <div class="field">
          <label for="coop-value">Wert</label>
          <input
            id="coop-value"
            type="number"
            step="0.01"
            value="${coop?.value ?? ""}"
          />
        </div>

        <div class="field">
          <label for="coop-code">Code</label>
          <input
            id="coop-code"
            type="text"
            value="${esc(coop?.code || "")}"
          />
        </div>

        <div class="field">
          <label>
            <input
              type="checkbox"
              id="coop-active"
              ${coop?.is_active ? "checked" : ""}
            />
            Aktiv
          </label>
        </div>
      `,

      footHTML: `
        <button
          class="btn"
          type="button"
          data-close
        >
          Abbrechen
        </button>

        <button
          class="btn btn-primary"
          type="button"
          data-save
        >
          ${isNew ? "Hinzufügen" : "Speichern"}
        </button>
      `,

      onMount(root) {
        $("[data-save]", root)?.addEventListener(
          "click",
          async () => {
            const name =
              $("#coop-name", root).value.trim();

            const kind =
              $("#coop-kind", root).value;

            const value =
              parseFloat(
                $("#coop-value", root).value,
              ) || 0;

            const code =
              $("#coop-code", root).value.trim();

            const is_active =
              $("#coop-active", root).checked;

            if (!name || !code) {
              toast(
                "Name und Code dürfen nicht leer sein",
                "error",
              );
              return;
            }

            try {
              const data = {
                name,
                kind,
                value,
                code,
                is_active,
              };

              if (isNew) {
                await DB.createCoop(data);
              } else {
                await DB.updateCoop(
                  coop.id,
                  data,
                );
              }

              closeModal();
              await Admin.loadTab();

              toast(
                isNew
                  ? "Kooperation hinzugefügt"
                  : "Kooperation gespeichert",
              );
            } catch (error) {
              fail(error);
            }
          },
        );
      },
    });
  },

  async deleteCoop(id) {
    const coop = this.coops.find(
      (item) =>
        String(item.id) === String(id),
    );

    if (!coop) {
      return;
    }

    const confirmed = await confirmDialog(
      "Kooperation löschen?",
      `"${coop.name}" wird endgültig gelöscht.`,
      "Löschen",
    );

    if (!confirmed) {
      return;
    }

    try {
      await DB.deleteCoop(id);
      await this.loadTab();
      toast("Kooperation gelöscht");
    } catch (error) {
      fail(error);
    }
  },

  /* ------------------------------------------------------------------------
     Personal
     ------------------------------------------------------------------------ */

  renderStaff() {
    const roleNames = {
      admin: "Admin",
      service: "Serviceleitung",
      lager: "Lager",
      kasse: "Kasse",
    };

    let html = `
      <div class="toolbar">
        <button
          class="btn btn-primary"
          id="staff-add"
          type="button"
        >
          + Mitarbeiter
        </button>

        <span class="spacer"></span>

        <span
          class="muted"
          style="font-size:var(--text-sm)"
        >
          ${this.staff.length} Mitarbeiter
        </span>
      </div>

      <div
        class="card"
        style="margin-top:var(--space-4)"
      >
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

    for (const staff of this.staff) {
      html += `
        <tr>
          <td>${esc(staff.name)}</td>
          <td>${esc(roleNames[staff.role] || staff.role)}</td>
          <td>
            <code>${esc(staff.pin || "—")}</code>
          </td>
          <td>${staff.is_active ? "✅" : "❌"}</td>

          <td class="actions">
            <button
              class="icon-btn"
              type="button"
              data-staff-edit="${esc(staff.id)}"
              aria-label="Bearbeiten"
            >
              ✎
            </button>

            <button
              class="icon-btn"
              type="button"
              data-staff-delete="${esc(staff.id)}"
              aria-label="Löschen"
            >
              ×
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

    $("#staff-add")?.addEventListener(
      "click",
      () => this.editStaff(),
    );

    $$("#admin-body [data-staff-edit]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          this.editStaff(
            button.dataset.staffEdit,
          );
        });
      },
    );

    $$("#admin-body [data-staff-delete]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          this.deleteStaff(
            button.dataset.staffDelete,
          );
        });
      },
    );
  },

  async editStaff(id = null) {
    const staff = id
      ? this.staff.find(
          (item) =>
            String(item.id) === String(id),
        )
      : null;

    const isNew = !staff;

    openModal({
      title: isNew
        ? "Mitarbeiter hinzufügen"
        : "Mitarbeiter bearbeiten",

      bodyHTML: `
        <div class="field">
          <label for="staff-name">Name</label>
          <input
            id="staff-name"
            type="text"
            value="${esc(staff?.name || "")}"
          />
        </div>

        <div class="field">
          <label for="staff-role">Rolle</label>
          <select id="staff-role">
            <option
              value="admin"
              ${staff?.role === "admin" ? "selected" : ""}
            >
              Admin
            </option>

            <option
              value="service"
              ${staff?.role === "service" ? "selected" : ""}
            >
              Serviceleitung
            </option>

            <option
              value="lager"
              ${staff?.role === "lager" ? "selected" : ""}
            >
              Lager
            </option>

            <option
              value="kasse"
              ${staff?.role === "kasse" ? "selected" : ""}
            >
              Kasse
            </option>
          </select>
        </div>

        <div class="field">
          <label for="staff-pin">
            PIN (4 Ziffern)
          </label>
          <input
            id="staff-pin"
            type="text"
            maxlength="4"
            inputmode="numeric"
            value="${esc(staff?.pin || "")}"
          />
        </div>

        <div class="field">
          <label>
            <input
              type="checkbox"
              id="staff-active"
              ${staff?.is_active ? "checked" : ""}
            />
            Aktiv
          </label>
        </div>
      `,

      footHTML: `
        <button
          class="btn"
          type="button"
          data-close
        >
          Abbrechen
        </button>

        <button
          class="btn btn-primary"
          type="button"
          data-save
        >
          ${isNew ? "Hinzufügen" : "Speichern"}
        </button>
      `,

      onMount(root) {
        $("[data-save]", root)?.addEventListener(
          "click",
          async () => {
            const name =
              $("#staff-name", root).value.trim();

            const role =
              $("#staff-role", root).value;

            const pin =
              $("#staff-pin", root).value.trim();

            const is_active =
              $("#staff-active", root).checked;

            if (!name) {
              toast(
                "Name darf nicht leer sein",
                "error",
              );
              return;
            }

            if (!/^[0-9]{4}$/.test(pin)) {
              toast(
                "PIN muss genau 4 Ziffern enthalten",
                "error",
              );
              return;
            }

            try {
              const data = {
                name,
                role,
                pin,
                is_active,
              };

              if (isNew) {
                await DB.createStaff(data);
              } else {
                await DB.updateStaff(
                  staff.id,
                  data,
                );
              }

              closeModal();
              await Admin.loadTab();

              toast(
                isNew
                  ? "Mitarbeiter hinzugefügt"
                  : "Mitarbeiter gespeichert",
              );
            } catch (error) {
              fail(error);
            }
          },
        );
      },
    });
  },

  async deleteStaff(id) {
    const staff = this.staff.find(
      (item) =>
        String(item.id) === String(id),
    );

    if (!staff) {
      return;
    }

    const confirmed = await confirmDialog(
      "Mitarbeiter löschen?",
      `"${staff.name}" wird endgültig gelöscht.`,
      "Löschen",
    );

    if (!confirmed) {
      return;
    }

    try {
      await DB.deleteStaff(id);
      await this.loadTab();
      toast("Mitarbeiter gelöscht");
    } catch (error) {
      fail(error);
    }
  },

  /* ------------------------------------------------------------------------
     Dienstzeiten
     ------------------------------------------------------------------------ */

  renderShifts() {
    const byStaff = {};

    for (const shift of this.shifts) {
      const key = String(shift.staff_id);

      if (!byStaff[key]) {
        byStaff[key] = [];
      }

      byStaff[key].push(shift);
    }

    let html = `
      <div class="toolbar">
        <span
          class="muted"
          style="font-size:var(--text-sm)"
        >
          ${this.shiftRange} Tage ·
          ${this.shifts.length} Schichten
        </span>
      </div>

      <div
        class="card"
        style="margin-top:var(--space-4)"
      >
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

    for (const [staffId, shifts] of Object.entries(
      byStaff,
    )) {
      const staff = this.staff.find(
        (item) =>
          String(item.id) === String(staffId),
      );

      const totalSeconds = shifts.reduce(
        (total, shift) => {
          const start = new Date(
            shift.started_at,
          ).getTime();

          const end = shift.ended_at
            ? new Date(shift.ended_at).getTime()
            : Date.now();

          return total + (end - start) / 1000;
        },
        0,
      );

      html += `
        <tr>
          <td>${esc(staff?.name || "Unbekannt")}</td>
          <td class="num">${shifts.length}</td>
          <td class="num">
            ${fmtDuration(totalSeconds)}
          </td>
          <td>
            <button
              class="btn btn-sm"
              type="button"
              data-shifts-show="${esc(staffId)}"
            >
              Anzeigen
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

    $$("#admin-body [data-shifts-show]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          this.showShifts(
            button.dataset.shiftsShow,
          );
        });
      },
    );
  },

  showShifts(staffId) {
    const staff = this.staff.find(
      (item) =>
        String(item.id) === String(staffId),
    );

    const shifts = this.shifts
      .filter(
        (shift) =>
          String(shift.staff_id) ===
          String(staffId),
      )
      .sort(
        (a, b) =>
          new Date(b.started_at) -
          new Date(a.started_at),
      );

    let html = `
      <div class="toolbar">
        <button
          class="btn"
          type="button"
          id="shifts-back"
        >
          Zurück
        </button>

        <span class="spacer"></span>

        <span
          class="muted"
          style="font-size:var(--text-sm)"
        >
          ${esc(staff?.name || "")}
        </span>
      </div>

      <div
        class="card"
        style="margin-top:var(--space-4)"
      >
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

    for (const shift of shifts) {
      const duration = shift.ended_at
        ? fmtDuration(
            (
              new Date(
                shift.ended_at,
              ).getTime() -
              new Date(
                shift.started_at,
              ).getTime()
            ) / 1000,
          )
        : "—";

      html += `
        <tr>
          <td>${fmtDateTime(shift.started_at)}</td>
          <td>
            ${
              shift.ended_at
                ? fmtDateTime(shift.ended_at)
                : "—"
            }
          </td>
          <td class="num">${duration}</td>
          <td>${shift.ended_auto ? "✅" : "❌"}</td>
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

    $("#shifts-back")?.addEventListener(
      "click",
      () => {
        this.tab = "dienstzeiten";
        this.paintTabs();
        this.loadTab();
      },
    );
  },

  /* ------------------------------------------------------------------------
     Einstellungen
     ------------------------------------------------------------------------ */

  renderSettings() {
    const settings = State.settings || {};

    const businessName =
      String(settings.business_name || "").trim() ||
      "Masora Döner";

    const logoUrl =
      String(settings.logo_url || "").trim();

    const primaryColor =
      /^#[0-9a-fA-F]{6}$/.test(
        settings.primary_color,
      )
        ? settings.primary_color
        : "#e95420";

    const accentColor =
      /^#[0-9a-fA-F]{6}$/.test(
        settings.accent_color,
      )
        ? settings.accent_color
        : "#e35d6a";

    $("#admin-body").innerHTML = `
      <div class="card">
        <div class="card-head">
          <span class="card-title">Allgemein</span>
        </div>

        <div class="card-body">
          <div class="field">
            <label for="set-name">
              Name des Geschäfts
            </label>

            <input
              id="set-name"
              type="text"
              value="${esc(businessName)}"
              placeholder="Masora Döner"
              autocomplete="organization"
            />
          </div>

          <div class="field">
            <label for="set-logo">
              Logo-URL
            </label>

            <input
              id="set-logo"
              type="url"
              value="${esc(logoUrl)}"
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div class="field">
            <label for="set-primary-color">
              Hauptfarbe
            </label>

            <input
              id="set-primary-color"
              type="color"
              value="${primaryColor}"
            />
          </div>

          <div class="field">
            <label for="set-accent-color">
              Akzentfarbe
            </label>

            <input
              id="set-accent-color"
              type="color"
              value="${accentColor}"
            />
          </div>
        </div>

        <div class="card-foot">
          <button
            class="btn btn-primary"
            id="set-save"
            type="button"
          >
            Speichern
          </button>
        </div>
      </div>
    `;

    $("#set-save")?.addEventListener(
      "click",
      async () => {
        const business_name =
          $("#set-name")?.value.trim() || "";

        const logo_url =
          $("#set-logo")?.value.trim() || null;

        const primary_color =
          $("#set-primary-color")?.value ||
          "#e95420";

        const accent_color =
          $("#set-accent-color")?.value ||
          "#e35d6a";

        if (!business_name) {
          toast(
            "Bitte einen Geschäftsnamen eingeben",
            "error",
          );
          return;
        }

        try {
          const saved =
            await DB.updateSettings({
              business_name,
              logo_url,
              primary_color,
              accent_color,
            });

          State.settings = saved;

          if (
            window.App &&
            typeof App.paintBrand === "function"
          ) {
            App.paintBrand();
          }

          if (
            window.App &&
            typeof App.paintTheme === "function"
          ) {
            App.paintTheme();
          }

          if (
            window.App &&
            typeof App.paintLogo === "function"
          ) {
            App.paintLogo();
          }

          toast("Einstellungen gespeichert");
        } catch (error) {
          fail(error);
        }
      },
    );
  },

  /* ------------------------------------------------------------------------
     Tagesabschluss
     ------------------------------------------------------------------------ */

  renderClosing(orders) {
    const validOrders = orders.filter(
      (order) =>
        order.status !== "storniert",
    );

    const revenue = validOrders.reduce(
      (total, order) =>
        total + (Number(order.total) || 0),
      0,
    );

    const cash = validOrders
      .filter(
        (order) =>
          order.payment_method === "bar",
      )
      .reduce(
        (total, order) =>
          total + (Number(order.total) || 0),
        0,
      );

    const card = validOrders
      .filter(
        (order) =>
          order.payment_method === "karte",
      )
      .reduce(
        (total, order) =>
          total + (Number(order.total) || 0),
        0,
      );

    const sortedOrders = [
      ...validOrders,
    ].sort(
      (a, b) =>
        new Date(b.created_at) -
        new Date(a.created_at),
    );

    let html = `
      <div
        class="stats"
        style="margin-bottom:var(--space-6)"
      >
        <div class="stat accent">
          <div class="stat-label">
            Umsatz heute
          </div>
          <div class="stat-value">
            ${money(revenue)}
          </div>
        </div>

        <div class="stat">
          <div class="stat-label">Bar</div>
          <div class="stat-value">
            ${money(cash)}
          </div>
        </div>

        <div class="stat">
          <div class="stat-label">Karte</div>
          <div class="stat-value">
            ${money(card)}
          </div>
        </div>

        <div class="stat">
          <div class="stat-label">
            Bestellungen
          </div>
          <div class="stat-value">
            ${validOrders.length}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <span class="card-title">
            Bestellungen heute
          </span>
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

    for (const order of sortedOrders) {
      html += `
        <tr>
          <td>${fmtTime(order.created_at)}</td>
          <td class="num">
            ${money(order.total)}
          </td>
          <td>
            ${
              order.payment_method === "bar"
                ? "Bar"
                : "Karte"
            }
          </td>
          <td>✅</td>
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
    $("#admin-subnav")?.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest(
          "button[data-tab]",
        );

        if (!button || button.classList.contains("hidden")) {
          return;
        }

        this.tab = button.dataset.tab;
        this.paintTabs();
        this.loadTab();
      },
    );
  },
};

window.Admin = Admin;
