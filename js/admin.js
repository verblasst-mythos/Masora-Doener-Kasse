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
          typeof App.applySettings === "function"
        ) {
          App.applySettings();
        } else {
          App.paintBrand?.();
          App.paintTheme?.();
          App.paintLogo?.();
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
     Einstellungen und Personalisierung
     ------------------------------------------------------------------------ */

  renderSettings() {
    const defaults = window.DEFAULT_SETTINGS || {
      business_name: "Masora Döner",
      business_subtitle: "Kassensystem",
      logo_url: null,
      primary_color: "#e95420",
      accent_color: "#e35d6a",
      theme_mode: "dark",
      accent_preset: "paprika",
      compact_mode: false,
      default_payment: "cash",
      show_vat: true,
      auto_print_receipt: false,
      confirm_cart_clear: true,
      session_timeout_minutes: 30,
    };

    const settings = {
      ...defaults,
      ...(State.settings || {}),
    };

    const validHex = (value, fallback) =>
      /^#[0-9a-fA-F]{6}$/.test(String(value || ""))
        ? String(value)
        : fallback;

    const validTheme = ["dark", "light", "system"].includes(
      settings.theme_mode,
    )
      ? settings.theme_mode
      : "dark";

    const validPreset = [
      "paprika",
      "red",
      "gold",
      "green",
      "blue",
      "purple",
    ].includes(settings.accent_preset)
      ? settings.accent_preset
      : "paprika";

    const validPayment =
      settings.default_payment === "card"
        ? "card"
        : "cash";

    const validSession = [15, 30, 60, 120].includes(
      Number(settings.session_timeout_minutes),
    )
      ? Number(settings.session_timeout_minutes)
      : 30;

    const presets = [
      { id: "paprika", name: "Paprika", color: "#e25a24" },
      { id: "red", name: "Rot", color: "#d94c58" },
      { id: "gold", name: "Gold", color: "#d89b28" },
      { id: "green", name: "Grün", color: "#55a86a" },
      { id: "blue", name: "Blau", color: "#4e8edc" },
      { id: "purple", name: "Lila", color: "#8a6bd1" },
    ];

    const navItems = [
      {
        id: "business",
        icon: "⌂",
        title: "Betrieb",
        description: "Name, Untertitel und Logo",
      },
      {
        id: "design",
        icon: "◐",
        title: "Design",
        description: "Theme, Farben und Ansicht",
      },
      {
        id: "pos",
        icon: "▣",
        title: "Kasse",
        description: "Zahlung und Bon-Ablauf",
      },
      {
        id: "security",
        icon: "◉",
        title: "Sicherheit",
        description: "Sitzung und automatische Abmeldung",
      },
    ];

    const settingsNavHtml = navItems
      .map(
        (item) => `
          <button
            class="settings-nav-item"
            type="button"
            data-settings-section="${item.id}"
            aria-current="${item.id === "business"}"
          >
            <span class="settings-nav-icon">${item.icon}</span>

            <span class="settings-nav-copy">
              <strong>${esc(item.title)}</strong>
              <small>${esc(item.description)}</small>
            </span>

            <span class="settings-nav-arrow">›</span>
          </button>
        `,
      )
      .join("");

    const presetHtml = presets
      .map(
        (preset) => `
          <button
            class="accent-option ${
              preset.id === validPreset ? "is-selected" : ""
            }"
            type="button"
            data-accent-option="${preset.id}"
            style="--option-color:${preset.color}"
            aria-pressed="${preset.id === validPreset}"
          >
            <span class="accent-option-dot"></span>
            <span>${esc(preset.name)}</span>
          </button>
        `,
      )
      .join("");

    $("#admin-body").innerHTML = `
      <div class="settings-v2">
        <aside class="settings-sidebar">
          <div class="settings-sidebar-head">
            <span class="settings-sidebar-kicker">System</span>
            <h2>Einstellungen</h2>
            <p>
              Passe Kasse, Design und Ablauf an.
            </p>
          </div>

          <nav class="settings-nav" aria-label="Einstellungen">
            ${settingsNavHtml}
          </nav>

          <div class="settings-sidebar-footer">
            <span class="settings-sidebar-dot"></span>
            <span>Änderungen werden erst nach dem Speichern übernommen.</span>
          </div>
        </aside>

        <section class="settings-content">
          <!-- Betrieb -->
          <section
            class="settings-section"
            data-settings-panel="business"
          >
            <div class="settings-page-head">
              <div>
                <span class="settings-page-kicker">Betrieb</span>
                <h2>Geschäftsdaten</h2>
                <p>
                  Diese Angaben erscheinen in der Navigation und auf Bons.
                </p>
              </div>

              <div class="settings-section-icon">⌂</div>
            </div>

            <div class="settings-content-card">
              <div class="settings-content-card-head">
                <div>
                  <strong>Markenauftritt</strong>
                  <span>Name und Logo deiner Kasse</span>
                </div>
              </div>

              <div class="settings-form settings-form-two">
                <div class="field">
                  <label for="set-name">Geschäftsname</label>
                  <input
                    class="input"
                    id="set-name"
                    type="text"
                    value="${esc(
                      String(settings.business_name || "").trim() ||
                        "Masora Döner",
                    )}"
                    placeholder="Masora Döner"
                    autocomplete="organization"
                  />
                </div>

                <div class="field">
                  <label for="set-subtitle">Untertitel</label>
                  <input
                    class="input"
                    id="set-subtitle"
                    type="text"
                    value="${esc(
                      String(settings.business_subtitle || "").trim() ||
                        "Kassensystem",
                    )}"
                    placeholder="Kassensystem"
                  />
                </div>

                <div class="field settings-form-full">
                  <label for="set-logo">Logo-URL</label>
                  <input
                    class="input"
                    id="set-logo"
                    type="url"
                    value="${esc(String(settings.logo_url || "").trim())}"
                    placeholder="https://example.com/logo.png"
                  />
                  <span class="field-hint">
                    Optional. Nutze eine direkte Bild-URL, wenn du ein eigenes Logo anzeigen möchtest.
                  </span>
                </div>
              </div>

              <div class="brand-preview" id="brand-preview">
                <span class="brand-preview-mark">M</span>
                <span>
                  <strong id="preview-business-name">
                    ${esc(
                      String(settings.business_name || "").trim() ||
                        "Masora Döner",
                    )}
                  </strong>
                  <small id="preview-business-subtitle">
                    ${esc(
                      String(settings.business_subtitle || "").trim() ||
                        "Kassensystem",
                    )}
                  </small>
                </span>
              </div>
            </div>
          </section>

          <!-- Design -->
          <section
            class="settings-section hidden"
            data-settings-panel="design"
          >
            <div class="settings-page-head">
              <div>
                <span class="settings-page-kicker">Design</span>
                <h2>Farben und Erscheinung</h2>
                <p>
                  Wähle ein Theme und passe die Markenfarbe an.
                </p>
              </div>

              <div class="settings-section-icon">◐</div>
            </div>

            <div class="settings-content-card">
              <div class="settings-content-card-head">
                <div>
                  <strong>Darstellung</strong>
                  <span>Farbschema der gesamten Anwendung</span>
                </div>
              </div>

              <div class="theme-choice-grid">
                <button
                  class="theme-choice ${validTheme === "light" ? "is-selected" : ""}"
                  type="button"
                  data-theme-choice="light"
                  aria-pressed="${validTheme === "light"}"
                >
                  <span class="theme-choice-preview theme-light-preview">
                    <span></span><span></span><span></span>
                  </span>
                  <strong>Hell</strong>
                  <small>Helle Arbeitsfläche</small>
                </button>

                <button
                  class="theme-choice ${validTheme === "dark" ? "is-selected" : ""}"
                  type="button"
                  data-theme-choice="dark"
                  aria-pressed="${validTheme === "dark"}"
                >
                  <span class="theme-choice-preview theme-dark-preview">
                    <span></span><span></span><span></span>
                  </span>
                  <strong>Dunkel</strong>
                  <small>Ruhig für Abendbetrieb</small>
                </button>

                <button
                  class="theme-choice ${validTheme === "system" ? "is-selected" : ""}"
                  type="button"
                  data-theme-choice="system"
                  aria-pressed="${validTheme === "system"}"
                >
                  <span class="theme-choice-preview theme-system-preview">
                    <span></span><span></span><span></span>
                  </span>
                  <strong>System</strong>
                  <small>Folgt dem Gerät</small>
                </button>
              </div>

              <input
                id="set-theme"
                type="hidden"
                value="${validTheme}"
              />
            </div>

            <div class="settings-content-card">
              <div class="settings-content-card-head">
                <div>
                  <strong>Akzentfarbe</strong>
                  <span>Wird für Navigation, Buttons und Highlights verwendet</span>
                </div>
              </div>

              <div class="accent-options settings-accent-options">
                ${presetHtml}
              </div>

              <div class="settings-color-grid">
                <div class="field">
                  <label for="set-primary-color">Primärfarbe</label>
                  <input
                    id="set-primary-color"
                    type="color"
                    value="${validHex(settings.primary_color, "#e95420")}"
                  />
                </div>

                <div class="field">
                  <label for="set-accent-color">Zusatzfarbe</label>
                  <input
                    id="set-accent-color"
                    type="color"
                    value="${validHex(settings.accent_color, "#e35d6a")}"
                  />
                </div>
              </div>

              <div class="color-preview" id="color-preview">
                <div class="color-preview-sidebar">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>

                <div class="color-preview-main">
                  <span class="color-preview-title">Vorschau</span>
                  <span class="color-preview-line"></span>

                  <div class="color-preview-product">
                    <span>Produkt</span>
                    <strong>7,50 €</strong>
                  </div>

                  <button type="button">Bezahlen</button>
                </div>
              </div>
            </div>

            <div class="settings-content-card">
              <label class="setting-toggle">
                <input
                  id="set-compact"
                  type="checkbox"
                  ${settings.compact_mode ? "checked" : ""}
                />

                <span class="setting-toggle-content">
                  <span class="setting-toggle-title">
                    Kompakte Kassenansicht
                  </span>

                  <span class="setting-toggle-text">
                    Kleinere Produktkarten und geringere Abstände verwenden.
                  </span>
                </span>

                <span class="toggle-ui"></span>
              </label>
            </div>
          </section>

          <!-- Kasse -->
          <section
            class="settings-section hidden"
            data-settings-panel="pos"
          >
            <div class="settings-page-head">
              <div>
                <span class="settings-page-kicker">Kasse</span>
                <h2>Kassierablauf</h2>
                <p>
                  Lege fest, wie Bestellungen und Bons behandelt werden.
                </p>
              </div>

              <div class="settings-section-icon">▣</div>
            </div>

            <div class="settings-content-card">
              <div class="settings-content-card-head">
                <div>
                  <strong>Standardzahlung</strong>
                  <span>Diese Zahlungsart wird beim Kassieren hervorgehoben</span>
                </div>
              </div>

              <div class="payment-choice-grid">
                <button
                  class="payment-choice ${
                    validPayment === "cash" ? "is-selected" : ""
                  }"
                  type="button"
                  data-payment-choice="cash"
                  aria-pressed="${validPayment === "cash"}"
                >
                  <span class="payment-choice-icon">€</span>
                  <span>
                    <strong>Barzahlung</strong>
                    <small>Rückgeld berechnen</small>
                  </span>
                </button>

                <button
                  class="payment-choice ${
                    validPayment === "card" ? "is-selected" : ""
                  }"
                  type="button"
                  data-payment-choice="card"
                  aria-pressed="${validPayment === "card"}"
                >
                  <span class="payment-choice-icon">▰</span>
                  <span>
                    <strong>Kartenzahlung</strong>
                    <small>Terminal-Zahlung</small>
                  </span>
                </button>
              </div>

              <input
                id="set-payment"
                type="hidden"
                value="${validPayment}"
              />
            </div>

            <div class="settings-content-card settings-toggle-list">
              <label class="setting-toggle">
                <input
                  id="set-vat"
                  type="checkbox"
                  ${settings.show_vat !== false ? "checked" : ""}
                />

                <span class="setting-toggle-content">
                  <span class="setting-toggle-title">MwSt. anzeigen</span>
                  <span class="setting-toggle-text">
                    Die enthaltene Mehrwertsteuer im Warenkorb anzeigen.
                  </span>
                </span>

                <span class="toggle-ui"></span>
              </label>

              <label class="setting-toggle">
                <input
                  id="set-print"
                  type="checkbox"
                  ${settings.auto_print_receipt ? "checked" : ""}
                />

                <span class="setting-toggle-content">
                  <span class="setting-toggle-title">
                    Bon automatisch drucken
                  </span>
                  <span class="setting-toggle-text">
                    Nach dem Bezahlen den Druckdialog automatisch öffnen.
                  </span>
                </span>

                <span class="toggle-ui"></span>
              </label>

              <label class="setting-toggle">
                <input
                  id="set-confirm-clear"
                  type="checkbox"
                  ${settings.confirm_cart_clear !== false ? "checked" : ""}
                />

                <span class="setting-toggle-content">
                  <span class="setting-toggle-title">
                    Warenkorb-Leeren bestätigen
                  </span>
                  <span class="setting-toggle-text">
                    Verhindert, dass ein Bon versehentlich gelöscht wird.
                  </span>
                </span>

                <span class="toggle-ui"></span>
              </label>
            </div>
          </section>

          <!-- Sicherheit -->
          <section
            class="settings-section hidden"
            data-settings-panel="security"
          >
            <div class="settings-page-head">
              <div>
                <span class="settings-page-kicker">Sicherheit</span>
                <h2>Sitzung verwalten</h2>
                <p>
                  Schütze die Kasse durch eine automatische Abmeldung.
                </p>
              </div>

              <div class="settings-section-icon">◉</div>
            </div>

            <div class="settings-content-card">
              <div class="settings-content-card-head">
                <div>
                  <strong>Automatische Abmeldung</strong>
                  <span>Bei Inaktivität wird die aktuelle Sitzung beendet</span>
                </div>
              </div>

              <div class="session-choice-grid">
                ${[15, 30, 60, 120]
                  .map(
                    (minutes) => `
                      <button
                        class="session-choice ${
                          validSession === minutes ? "is-selected" : ""
                        }"
                        type="button"
                        data-session-choice="${minutes}"
                        aria-pressed="${validSession === minutes}"
                      >
                        <strong>${minutes}</strong>
                        <span>Minuten</span>
                      </button>
                    `,
                  )
                  .join("")}
              </div>

              <input
                id="set-session"
                type="hidden"
                value="${validSession}"
              />

              <div class="settings-info">
                <span class="settings-info-icon">i</span>
                <span>
                  Die Kasse wird nach der gewählten Zeit automatisch abgemeldet.
                  Eine aktive Schicht wird dabei automatisch beendet.
                </span>
              </div>
            </div>
          </section>
        </section>
      </div>

      <div class="settings-actions settings-actions-v2">
        <span class="muted" id="settings-status">
          Noch nicht gespeichert
        </span>

        <button
          class="btn btn-primary"
          id="set-save"
          type="button"
        >
          Änderungen speichern
        </button>
      </div>
    `;

    let selectedAccent = validPreset;

    const setActiveSection = (sectionId) => {
      $$("#admin-body [data-settings-section]").forEach((button) => {
        const isActive = button.dataset.settingsSection === sectionId;

        button.setAttribute("aria-current", String(isActive));
      });

      $$("#admin-body [data-settings-panel]").forEach((panel) => {
        panel.classList.toggle(
          "hidden",
          panel.dataset.settingsPanel !== sectionId,
        );
      });
    };

    const paintAccentSelection = () => {
      $$("#admin-body [data-accent-option]").forEach((button) => {
        const isSelected =
          button.dataset.accentOption === selectedAccent;

        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      });
    };

    const paintThemeSelection = () => {
      const selectedTheme = $("#set-theme")?.value || "dark";

      $$("#admin-body [data-theme-choice]").forEach((button) => {
        const isSelected =
          button.dataset.themeChoice === selectedTheme;

        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      });
    };

    const paintPaymentSelection = () => {
      const selectedPayment = $("#set-payment")?.value || "cash";

      $$("#admin-body [data-payment-choice]").forEach((button) => {
        const isSelected =
          button.dataset.paymentChoice === selectedPayment;

        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      });
    };

    const paintSessionSelection = () => {
      const selectedSession = Number($("#set-session")?.value || 30);

      $$("#admin-body [data-session-choice]").forEach((button) => {
        const isSelected =
          Number(button.dataset.sessionChoice) === selectedSession;

        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      });
    };

    const updateBrandPreview = () => {
      const name =
        $("#set-name")?.value.trim() || "Masora Döner";

      const subtitle =
        $("#set-subtitle")?.value.trim() || "Kassensystem";

      $("#preview-business-name").textContent = name;
      $("#preview-business-subtitle").textContent = subtitle;
    };

    const updateColorPreview = () => {
      const primary =
        $("#set-primary-color")?.value || "#e95420";

      const accent =
        $("#set-accent-color")?.value || "#e35d6a";

      const preview = $("#color-preview");

      if (!preview) {
        return;
      }

      preview.style.setProperty("--preview-primary", primary);
      preview.style.setProperty("--preview-accent", accent);
    };

    $$("#admin-body [data-settings-section]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveSection(button.dataset.settingsSection);
      });
    });

    $$("#admin-body [data-theme-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = $("#set-theme");

        if (input) {
          input.value = button.dataset.themeChoice;
        }

        paintThemeSelection();
      });
    });

    $$("#admin-body [data-payment-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = $("#set-payment");

        if (input) {
          input.value = button.dataset.paymentChoice;
        }

        paintPaymentSelection();
      });
    });

    $$("#admin-body [data-session-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = $("#set-session");

        if (input) {
          input.value = button.dataset.sessionChoice;
        }

        paintSessionSelection();
      });
    });

    $$("#admin-body [data-accent-option]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedAccent = button.dataset.accentOption;

        const preset = window.ACCENT_PRESETS?.[selectedAccent];

        if (preset) {
          const primaryColor = $("#set-primary-color");
          const accentColor = $("#set-accent-color");

          if (primaryColor) {
            primaryColor.value = preset.primary;
          }

          if (accentColor) {
            accentColor.value = preset.accent;
          }
        }

        paintAccentSelection();
        updateColorPreview();
      });
    });

    $("#set-name")?.addEventListener("input", updateBrandPreview);
    $("#set-subtitle")?.addEventListener("input", updateBrandPreview);
    $("#set-primary-color")?.addEventListener("input", updateColorPreview);
    $("#set-accent-color")?.addEventListener("input", updateColorPreview);

    $("#set-save")?.addEventListener("click", async () => {
      const saveButton = $("#set-save");
      const status = $("#settings-status");

      const businessName =
        $("#set-name")?.value.trim() || "Masora Döner";

      const businessSubtitle =
        $("#set-subtitle")?.value.trim() || "Kassensystem";

      const logoUrl = $("#set-logo")?.value.trim() || null;
      const themeMode = $("#set-theme")?.value || "dark";
      const primaryColor =
        $("#set-primary-color")?.value || "#e95420";
      const accentColor =
        $("#set-accent-color")?.value || "#e35d6a";

      const compactMode = Boolean($("#set-compact")?.checked);
      const defaultPayment =
        $("#set-payment")?.value === "card" ? "card" : "cash";

      const showVat = Boolean($("#set-vat")?.checked);
      const autoPrintReceipt = Boolean($("#set-print")?.checked);
      const confirmCartClear = Boolean(
        $("#set-confirm-clear")?.checked,
      );

      const sessionTimeout =
        Number($("#set-session")?.value) || 30;

      try {
        if (saveButton) {
          saveButton.disabled = true;
          saveButton.textContent = "Speichert …";
        }

        if (status) {
          status.textContent = "Änderungen werden gespeichert …";
        }

        const saved = await DB.updateSettings({
          business_name: businessName,
          business_subtitle: businessSubtitle,
          logo_url: logoUrl,
          theme_mode: themeMode,
          accent_preset: selectedAccent,
          primary_color: primaryColor,
          accent_color: accentColor,
          compact_mode: compactMode,
          default_payment: defaultPayment,
          show_vat: showVat,
          auto_print_receipt: autoPrintReceipt,
          confirm_cart_clear: confirmCartClear,
          session_timeout_minutes: sessionTimeout,
        });

        State.settings = {
          ...(window.DEFAULT_SETTINGS || {}),
          ...saved,
        };

        if (window.App && typeof App.applySettings === "function") {
          App.applySettings();
        } else {
          App.paintBrand?.();
          App.paintTheme?.();
          App.paintLogo?.();
        }

        if (Duty?.isOn?.()) {
          Duty.startSession();
        }

        if (status) {
          status.textContent = "Änderungen gespeichert";
        }

        toast("Einstellungen gespeichert");
      } catch (error) {
        fail(error);

        if (status) {
          status.textContent = "Speichern fehlgeschlagen";
        }
      } finally {
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent = "Änderungen speichern";
        }
      }
    });

    setActiveSection("business");
    paintAccentSelection();
    paintThemeSelection();
    paintPaymentSelection();
    paintSessionSelection();
    updateBrandPreview();
    updateColorPreview();
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

        if (
          !button ||
          button.classList.contains("hidden")
        ) {
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
