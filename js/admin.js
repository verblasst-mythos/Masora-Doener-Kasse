const Admin = {
  open() {
    // Tabs basierend auf Rolle ein-/ausblenden
    const role = State.userRole || State.user?.role || "kasse";

    // Welche Tabs darf welche Rolle sehen?
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

    // Tabs ein-/ausblenden
    $$("#admin-subnav button").forEach((btn) => {
      const tab = btn.dataset.tab;
      const allowed = allowedTabs[tab] || ["admin"];
      btn.classList.toggle("hidden", !allowed.includes(role));
    });

    // Ersten sichtbaren Tab aktivieren
    const firstVisible = $("#admin-subnav button:not(.hidden)");
    if (firstVisible) {
      this.tab = firstVisible.dataset.tab;
    }

    // Tabs malen und laden
    this.paintTabs();
    this.loadTab();
  },

  /* ---------- Produkte ---------- */

  renderProducts() {
    const cats = [...new Set(this.products.map((p) => p.category))];

    $("#admin-body").innerHTML = `
      <div class="row" style="margin-bottom:var(--space-4)">
        <button class="btn btn-primary" data-new-product>+ Neues Produkt</button>
        <span class="muted" style="font-size:var(--text-sm)">
          ${this.products.length} Produkte in ${cats.length} Kategorien
        </span>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Produkt</th>
                <th>Kategorie</th>
                <th class="num">Preis</th>
                <th class="num">Bestand</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              ${
                this.products.length
                  ? this.products
                      .map(
                        (p) => `<tr>
            <td class="strong">${esc(p.name)}</td>
            <td class="muted">${esc(p.category)}</td>
            <td class="num">${money(p.price)}</td>
            <td class="num">
              ${
                p.track_stock === false
                  ? '<span class="muted">—</span>'
                  : Number(p.stock ?? 0)
              }
            </td>
            <td>
              <span class="tag ${p.is_active ? "ok" : ""}">
                ${p.is_active ? "Aktiv" : "Inaktiv"}
              </span>
            </td>
            <td>
              <div class="row" style="gap:var(--space-2);flex-wrap:nowrap">
                <button class="btn btn-sm" data-edit-product="${p.id}">
                  Bearbeiten
                </button>
                <button class="btn btn-sm btn-danger" data-del-product="${p.id}">
                  Löschen
                </button>
              </div>
            </td>
          </tr>`,
                      )
                      .join("")
                  : `<tr>
                      <td colspan="6" class="muted" style="padding:var(--space-8);text-align:center">
                        Noch keine Produkte angelegt.
                      </td>
                    </tr>`
              }
            </tbody>
          </table>
        </div>
      </div>`;
  },

  /**
   * Ermittelt die Reihenfolge-Nummer einer Kategorie.
   * Bekannte Kategorie -> gleiche Nummer wie bisher.
   * Neue Kategorie -> hinten anstellen.
   */
  categoryOrderFor(category) {
    const match = (this.products || []).find(
      (p) => p.category === category,
    );

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
      title: p ? "Produkt bearbeiten" : "Neues Produkt",

      bodyHTML: `
        <div class="field">
          <label for="f-name">Name</label>
          <input
            class="input"
            id="f-name"
            value="${esc(p?.name || "")}"
            placeholder="z. B. Döner mit Käse"
          >
        </div>

        <div class="field">
          <label for="f-cat">Kategorie</label>
          <input
            class="input"
            id="f-cat"
            list="cat-list"
            value="${esc(p?.category || cats[0] || "Döner")}"
          >

          <datalist id="cat-list">
            ${cats
              .map((c) => `<option value="${esc(c)}">`)
              .join("")}
          </datalist>
        </div>

        <div class="field">
          <label for="f-price">Preis in Euro</label>
          <input
            class="input"
            id="f-price"
            type="number"
            step="0.10"
            min="0"
            inputmode="decimal"
            value="${p ? Number(p.price).toFixed(2) : "0.00"}"
          >
        </div>

        <div class="field">
          <label for="f-sort">
            Sortierung (kleine Zahl = weiter vorne)
          </label>

          <input
            class="input"
            id="f-sort"
            type="number"
            step="1"
            value="${p?.sort_order ?? 0}"
          >
        </div>

        <div class="field">
          <label for="f-track">Lager führen</label>

          <select class="select" id="f-track">
            <option
              value="1"
              ${p?.track_stock !== false ? "selected" : ""}
            >
              Ja — Bestand wird beim Verkauf abgezogen
            </option>

            <option
              value="0"
              ${p?.track_stock === false ? "selected" : ""}
            >
              Nein — unbegrenzt verfügbar
            </option>
          </select>
        </div>

        <div class="field">
          <label for="f-stock">Bestand (Stück)</label>

          <input
            class="input"
            id="f-stock"
            type="number"
            step="1"
            min="0"
            value="${p ? Number(p.stock ?? 0) : 0}"
          >
        </div>

        <div class="field">
          <label for="f-min">
            Mindestbestand — darunter kommt eine Warnung
          </label>

          <input
            class="input"
            id="f-min"
            type="number"
            step="1"
            min="0"
            value="${p ? Number(p.min_stock ?? 0) : 5}"
          >
        </div>

        <div class="field">
          <label for="f-active">Status</label>

          <select class="select" id="f-active">
            <option
              value="1"
              ${p?.is_active !== false ? "selected" : ""}
            >
              Aktiv — in der Kasse sichtbar
            </option>

            <option
              value="0"
              ${p?.is_active === false ? "selected" : ""}
            >
              Inaktiv — ausgeblendet
            </option>
          </select>
        </div>
      `,

      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" id="f-save">
          Speichern
        </button>
      `,

      onMount: (root) => {
        $("#f-save", root).addEventListener("click", async () => {
          const category =
            $("#f-cat", root).value.trim() || "Sonstiges";

          const payload = {
            name: $("#f-name", root).value.trim(),
            category,
            category_order: this.categoryOrderFor(category),
            price: num($("#f-price", root).value),
            sort_order:
              parseInt($("#f-sort", root).value, 10) || 0,
            track_stock: $("#f-track", root).value === "1",
            stock: num($("#f-stock", root).value),
            min_stock: num($("#f-min", root).value),
            is_active: $("#f-active", root).value === "1",
          };

          if (!payload.name) {
            return toast(
              "Bitte einen Namen eingeben",
              "error",
            );
          }

          try {
            if (p) {
              await DB.updateProduct(p.id, payload);
            } else {
              await DB.createProduct(payload);
            }

            closeModal();

            toast(
              p
                ? "Produkt aktualisiert"
                : "Produkt angelegt",
            );

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
    $("#admin-body").innerHTML = `
      <div class="row" style="margin-bottom:var(--space-4)">
        <button class="btn btn-primary" data-new-discount>
          + Neuer Rabatt
        </button>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th>Art</th>
                <th class="num">Wert</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              ${
                this.discounts.length
                  ? this.discounts
                      .map(
                        (d) => `<tr>
              <td class="strong">${esc(d.name)}</td>
              <td class="muted">
                ${
                  d.kind === "percent"
                    ? "Prozent"
                    : "Fester Betrag"
                }
              </td>

              <td class="num">
                ${
                  d.kind === "percent"
                    ? Number(d.value) + " %"
                    : money(d.value)
                }
              </td>

              <td>
                <span class="tag ${d.is_active ? "ok" : ""}">
                  ${d.is_active ? "Aktiv" : "Inaktiv"}
                </span>
              </td>

              <td>
                <div
                  class="row"
                  style="gap:var(--space-2);flex-wrap:nowrap"
                >
                  <button
                    class="btn btn-sm"
                    data-edit-discount="${d.id}"
                  >
                    Bearbeiten
                  </button>

                  <button
                    class="btn btn-sm btn-danger"
                    data-del-discount="${d.id}"
                  >
                    Löschen
                  </button>
                </div>
              </td>
            </tr>`,
                      )
                      .join("")
                  : `<tr>
                      <td
                        colspan="5"
                        class="muted"
                        style="padding:var(--space-8);text-align:center"
                      >
                        Noch keine Rabatte angelegt.
                      </td>
                    </tr>`
              }
            </tbody>
          </table>
        </div>
      </div>`;
  },

  discountForm(d = null) {
    openModal({
      title: d ? "Rabatt bearbeiten" : "Neuer Rabatt",

      bodyHTML: `
        <div class="field">
          <label for="d-name">Bezeichnung</label>

          <input
            class="input"
            id="d-name"
            value="${esc(d?.name || "")}"
            placeholder="z. B. Stammkunde 10%"
          >
        </div>

        <div class="field">
          <label for="d-kind">Art</label>

          <select class="select" id="d-kind">
            <option
              value="percent"
              ${d?.kind !== "fixed" ? "selected" : ""}
            >
              Prozent vom Gesamtbetrag
            </option>

            <option
              value="fixed"
              ${d?.kind === "fixed" ? "selected" : ""}
            >
              Fester Betrag in Euro
            </option>
          </select>
        </div>

        <div class="field">
          <label for="d-value">Wert</label>

          <input
            class="input"
            id="d-value"
            type="number"
            step="0.5"
            min="0"
            inputmode="decimal"
            value="${d ? Number(d.value) : 10}"
          >
        </div>

        <div class="field">
          <label for="d-active">Status</label>

          <select class="select" id="d-active">
            <option
              value="1"
              ${d?.is_active !== false ? "selected" : ""}
            >
              Aktiv
            </option>

            <option
              value="0"
              ${d?.is_active === false ? "selected" : ""}
            >
              Inaktiv
            </option>
          </select>
        </div>
      `,

      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" id="d-save">
          Speichern
        </button>
      `,

      onMount: (root) => {
        $("#d-save", root).addEventListener(
          "click",
          async () => {
            const payload = {
              name: $("#d-name", root).value.trim(),
              kind: $("#d-kind", root).value,
              value: num($("#d-value", root).value),
              is_active:
                $("#d-active", root).value === "1",
            };

            if (!payload.name) {
              return toast(
                "Bitte eine Bezeichnung eingeben",
                "error",
              );
            }

            try {
              if (d) {
                await DB.updateDiscount(d.id, payload);
              } else {
                await DB.createDiscount(payload);
              }

              closeModal();
              toast("Gespeichert");

              await this.loadTab();
              await this.refreshKasse();
            } catch (err) {
              fail(err);
            }
          },
        );
      },
    });
  },

  /* ---------- Kooperationen ---------- */

  renderCoops() {
    $("#admin-body").innerHTML = `
      <div class="row" style="margin-bottom:var(--space-4)">
        <button class="btn btn-primary" data-new-coop>
          + Neue Kooperation
        </button>

        <span
          class="muted"
          style="font-size:var(--text-sm)"
        >
          Kooperationen sind Rabatte, die an der Kasse
          erst nach Eingabe des Codeworts gelten.
        </span>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Art</th>
                <th class="num">Rabatt</th>
                <th>Codewort</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              ${
                this.coops.length
                  ? this.coops
                      .map(
                        (c) => `<tr>
              <td class="strong">${esc(c.name)}</td>

              <td class="muted">
                ${
                  c.kind === "percent"
                    ? "Prozent"
                    : "Fester Betrag"
                }
              </td>

              <td class="num">
                ${
                  c.kind === "percent"
                    ? Number(c.value) + " %"
                    : money(c.value)
                }
              </td>

              <td>
                <code class="code">${esc(c.code)}</code>
              </td>

              <td>
                <span class="tag ${c.is_active ? "ok" : ""}">
                  ${c.is_active ? "Aktiv" : "Inaktiv"}
                </span>
              </td>

              <td>
                <div
                  class="row"
                  style="gap:var(--space-2);flex-wrap:nowrap"
                >
                  <button
                    class="btn btn-sm"
                    data-edit-coop="${c.id}"
                  >
                    Bearbeiten
                  </button>

                  <button
                    class="btn btn-sm btn-danger"
                    data-del-coop="${c.id}"
                  >
                    Löschen
                  </button>
                </div>
              </td>
            </tr>`,
                      )
                      .join("")
                  : `<tr>
                      <td
                        colspan="6"
                        class="muted"
                        style="padding:var(--space-8);text-align:center"
                      >
                        Noch keine Kooperationen angelegt.
                      </td>
                    </tr>`
              }
            </tbody>
          </table>
        </div>
      </div>`;
  },

  coopForm(c = null) {
    openModal({
      title: c
        ? "Kooperation bearbeiten"
        : "Neue Kooperation",

      bodyHTML: `
        <div class="field">
          <label for="c-name">Name des Partners</label>

          <input
            class="input"
            id="c-name"
            value="${esc(c?.name || "")}"
            placeholder="z. B. Fitnessstudio Nachbarschaft"
          >
        </div>

        <div class="field">
          <label for="c-kind">Art</label>

          <select class="select" id="c-kind">
            <option
              value="percent"
              ${c?.kind !== "fixed" ? "selected" : ""}
            >
              Prozent vom Gesamtbetrag
            </option>

            <option
              value="fixed"
              ${c?.kind === "fixed" ? "selected" : ""}
            >
              Fester Betrag in Euro
            </option>
          </select>
        </div>

        <div class="field">
          <label for="c-value">Rabatt</label>

          <input
            class="input"
            id="c-value"
            type="number"
            step="0.5"
            min="0"
            inputmode="decimal"
            value="${c ? Number(c.value) : 15}"
          >
        </div>

        <div class="field">
          <label for="c-code">Codewort</label>

          <input
            class="input"
            id="c-code"
            value="${esc(c?.code || "")}"
            autocomplete="off"
            placeholder="z. B. FIT15"
          >

          <p
            class="muted"
            style="font-size:var(--text-xs);margin-top:var(--space-2)"
          >
            Nur wer dieses Wort an der Kasse eingibt,
            bekommt den Rabatt.
            Groß- und Kleinschreibung ist egal.
          </p>
        </div>

        <div class="field">
          <label for="c-active">Status</label>

          <select class="select" id="c-active">
            <option
              value="1"
              ${c?.is_active !== false ? "selected" : ""}
            >
              Aktiv
            </option>

            <option
              value="0"
              ${c?.is_active === false ? "selected" : ""}
            >
              Inaktiv
            </option>
          </select>
        </div>
      `,

      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" id="c-save">
          Speichern
        </button>
      `,

      onMount: (root) => {
        $("#c-save", root).addEventListener(
          "click",
          async () => {
            const payload = {
              name: $("#c-name", root).value.trim(),
              kind: $("#c-kind", root).value,
              value: num($("#c-value", root).value),
              code: $("#c-code", root).value.trim(),
              is_active:
                $("#c-active", root).value === "1",
            };

            if (!payload.name) {
              return toast(
                "Bitte einen Namen eingeben",
                "error",
              );
            }

            if (payload.code.length < 3) {
              return toast(
                "Das Codewort braucht mindestens 3 Zeichen",
                "error",
              );
            }

            try {
              if (c) {
                await DB.updateCoop(c.id, payload);
              } else {
                await DB.createCoop(payload);
              }

              closeModal();
              toast("Gespeichert");

              await this.loadTab();
            } catch (err) {
              if (
                String(err.message).includes(
                  "cooperations_code_idx",
                )
              ) {
                return fail(
                  new Error(
                    "Dieses Codewort wird schon verwendet",
                  ),
                );
              }

              fail(err);
            }
          },
        );
      },
    });
  },

  /* ---------- Lager ---------- */

  renderStock() {
    const tracked = this.products.filter(
      (p) => p.track_stock !== false,
    );

    const low = tracked.filter(
      (p) =>
        Number(p.stock ?? 0) <=
        Number(p.min_stock ?? 0),
    );

    const out = tracked.filter(
      (p) => Number(p.stock ?? 0) <= 0,
    );

    const wert = num(
      tracked.reduce(
        (s, p) =>
          s +
          Number(p.stock ?? 0) *
            Number(p.price ?? 0),
        0,
      ),
    );

    const reasonLabel = {
      verkauf: "Verkauf",
      storno: "Storno",
      wareneingang: "Wareneingang",
      korrektur: "Korrektur",
      schwund: "Schwund",
    };

    $("#admin-body").innerHTML = `
      <div class="stack">

        <div class="stats" style="margin-bottom:0">
          <div class="stat accent">
            <div class="stat-label">
              Warenwert im Lager
            </div>
            <div class="stat-value">
              ${money(wert)}
            </div>
          </div>

          <div class="stat">
            <div class="stat-label">
              Artikel mit Lager
            </div>
            <div class="stat-value">
              ${tracked.length}
            </div>
          </div>

          <div class="stat">
            <div class="stat-label">
              Nachbestellen
            </div>
            <div class="stat-value">
              ${low.length}
            </div>
          </div>

          <div class="stat">
            <div class="stat-label">
              Ausverkauft
            </div>
            <div class="stat-value">
              ${out.length}
            </div>
          </div>
        </div>

        ${
          low.length
            ? `<div class="notice">
                <strong>Nachbestellen:</strong>
                ${low
                  .map(
                    (p) =>
                      `${esc(p.name)} (${Number(
                        p.stock ?? 0,
                      )})`,
                  )
                  .join(" · ")}
              </div>`
            : ""
        }

        <div>
          <div class="section-title">
            Bestand
          </div>

          <div class="card">
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>Artikel</th>
                    <th>Kategorie</th>
                    <th class="num">Bestand</th>
                    <th class="num">Minimum</th>
                    <th>Lage</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  ${
                    this.products.length
                      ? this.products
                          .map((p) => {
                            const t =
                              p.track_stock !== false;

                            const s = Number(
                              p.stock ?? 0,
                            );

                            const m = Number(
                              p.min_stock ?? 0,
                            );

                            let lage =
                              '<span class="tag">Ohne Lager</span>';

                            if (t && s <= 0) {
                              lage =
                                '<span class="tag bad">Ausverkauft</span>';
                            } else if (t && s <= m) {
                              lage =
                                '<span class="tag warn">Knapp</span>';
                            } else if (t) {
                              lage =
                                '<span class="tag ok">In Ordnung</span>';
                            }

                            return `<tr>
                              <td class="strong">
                                ${esc(p.name)}
                              </td>

                              <td class="muted">
                                ${esc(p.category)}
                              </td>

                              <td
                                class="num ${
                                  t && s <= m
                                    ? "is-low"
                                    : ""
                                }"
                              >
                                ${t ? s : "—"}
                              </td>

                              <td class="num muted">
                                ${t ? m : "—"}
                              </td>

                              <td>
                                ${lage}
                              </td>

                              <td>
                                <div
                                  class="row"
                                  style="gap:var(--space-2);flex-wrap:nowrap"
                                >
                                  <button
                                    class="btn btn-sm"
                                    data-stock-book="${p.id}"
                                    ${
                                      t
                                        ? ""
                                        : " disabled"
                                    }
                                  >
                                    Buchen
                                  </button>
                                </div>
                              </td>
                            </tr>`;
                          })
                          .join("")
                      : `<tr>
                          <td
                            colspan="6"
                            class="muted"
                            style="padding:var(--space-8);text-align:center"
                          >
                            Noch keine Produkte angelegt.
                          </td>
                        </tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div class="section-title">
            Letzte Lagerbewegungen
          </div>

          <div class="card">
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>Zeit</th>
                    <th>Artikel</th>
                    <th class="num">Menge</th>
                    <th>Grund</th>
                    <th>Wer</th>
                  </tr>
                </thead>

                <tbody>
                  ${
                    this.moves.length
                      ? this.moves
                          .map(
                            (m) => `<tr>
                              <td class="muted">
                                ${fmtDateTime(
                                  m.created_at,
                                )}
                              </td>

                              <td>
                                ${esc(m.product_name)}
                              </td>

                              <td
                                class="num ${
                                  Number(m.delta) < 0
                                    ? "is-minus"
                                    : "is-plus"
                                }"
                              >
                                ${
                                  Number(m.delta) > 0
                                    ? "+"
                                    : ""
                                }${Number(m.delta)}
                              </td>

                              <td>
                                <span class="tag">
                                  ${esc(
                                    reasonLabel[
                                      m.reason
                                    ] || m.reason,
                                  )}
                                </span>
                              </td>

                              <td class="muted">
                                ${esc(
                                  m.staff_name || "—",
                                )}
                              </td>
                            </tr>`,
                          )
                          .join("")
                      : `<tr>
                          <td
                            colspan="5"
                            class="muted"
                            style="padding:var(--space-8);text-align:center"
                          >
                            Noch keine Bewegungen erfasst.
                          </td>
                        </tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>`;
  },

  stockForm(p) {
    openModal({
      title: "Bestand buchen — " + p.name,

      bodyHTML: `
        <div class="pay-total">
          <div class="pay-total-label">
            Aktueller Bestand
          </div>

          <div class="pay-total-value">
            ${Number(p.stock ?? 0)}
          </div>
        </div>

        <div class="field">
          <label for="st-reason">Grund</label>

          <select class="select" id="st-reason">
            <option value="wareneingang">
              Wareneingang — Bestand erhöhen
            </option>

            <option value="schwund">
              Schwund oder Bruch — Bestand senken
            </option>

            <option value="korrektur">
              Korrektur nach Zählung
            </option>
          </select>
        </div>

        <div class="field">
          <label for="st-qty">Menge</label>

          <input
            class="input"
            id="st-qty"
            type="number"
            step="1"
            min="0"
            value="10"
            inputmode="numeric"
          >
        </div>

        <div class="quick-cash" id="st-quick">
          <button class="btn btn-sm" data-q="5">5</button>
          <button class="btn btn-sm" data-q="10">10</button>
          <button class="btn btn-sm" data-q="24">24</button>
          <button class="btn btn-sm" data-q="50">50</button>
        </div>

        <p
          class="muted"
          style="font-size:var(--text-sm);margin-top:var(--space-3)"
          id="st-preview"
        ></p>
      `,

      footHTML: `
        <button class="btn" data-close>
          Abbrechen
        </button>

        <button
          class="btn btn-primary"
          id="st-save"
        >
          Buchen
        </button>
      `,

      onMount: (root) => {
        const qty = $("#st-qty", root);
        const reason = $("#st-reason", root);
        const preview = $("#st-preview", root);

        const delta = () => {
          const v = Math.abs(num(qty.value));

          if (reason.value === "korrektur") {
            return num(
              v - Number(p.stock ?? 0),
            );
          }

          return reason.value === "wareneingang"
            ? v
            : -v;
        };

        const update = () => {
          const d = delta();

          const neu = num(
            Number(p.stock ?? 0) + d,
          );

          preview.textContent =
            reason.value === "korrektur"
              ? `Neuer Bestand: ${num(
                  Math.abs(qty.value),
                )} Stück (Differenz ${
                  d > 0 ? "+" : ""
                }${d})`
              : `Neuer Bestand: ${neu} Stück (${
                  d > 0 ? "+" : ""
                }${d})`;

          $("#st-save", root).disabled = d === 0;
        };

        qty.addEventListener("input", update);
        reason.addEventListener("change", update);

        $("#st-quick", root).addEventListener(
          "click",
          (e) => {
            const b =
              e.target.closest("button[data-q]");

            if (!b) return;

            qty.value = b.dataset.q;
            update();
          },
        );

        update();

        $("#st-save", root).addEventListener(
          "click",
          async () => {
            const d = delta();

            if (d === 0) return;

            try {
              await DB.adjustStock(
                p.id,
                d,
                reason.value,
                State.user?.name || null,
              );

              closeModal();

              toast(
                `${p.name}: Bestand gebucht (${
                  d > 0 ? "+" : ""
                }${d})`,
              );

              await this.loadTab();
              await this.refreshKasse();
            } catch (err) {
              fail(err);
            }
          },
        );
      },
    });
  },

  /* ---------- Dienstzeiten ---------- */

  renderShifts() {
    const now = Date.now();

    const secs = (s) =>
      (s.ended_at
        ? new Date(s.ended_at).getTime()
        : now) -
      new Date(s.started_at).getTime();

    // Zusammenfassung je Mitarbeiter
    const map = new Map();

    this.shifts.forEach((s) => {
      const key =
        s.staff_id || s.staff_name;

      if (!map.has(key)) {
        map.set(key, {
          name: s.staff_name,
          seconds: 0,
          count: 0,
          open: false,
          last: null,
        });
      }

      const e = map.get(key);

      e.count += 1;
      e.seconds += secs(s) / 1000;

      if (!s.ended_at) {
        e.open = true;
      }

      if (
        !e.last ||
        new Date(s.started_at) >
          new Date(e.last)
      ) {
        e.last = s.started_at;
      }
    });

    const summary = [...map.values()].sort(
      (a, b) => b.seconds - a.seconds,
    );

    const gesamt = summary.reduce(
      (a, e) => a + e.seconds,
      0,
    );

    const offen = this.shifts.filter(
      (s) => !s.ended_at,
    );

    const ranges = [
      { d: 1, label: "Heute" },
      { d: 7, label: "7 Tage" },
      { d: 30, label: "30 Tage" },
    ];

    $("#admin-body").innerHTML = `
      <div class="stack">

        <div class="row">
          <div class="subnav" id="sh-range">
            ${ranges
              .map(
                (r) =>
                  `<button
                    data-days="${r.d}"
                    aria-current="${
                      r.d === this.shiftRange
                    }"
                  >
                    ${r.label}
                  </button>`,
              )
              .join("")}
          </div>

          <span class="spacer"></span>

          <span
            class="muted"
            style="font-size:var(--text-sm)"
          >
            Gesamte Dienstzeit:
            <strong>
              ${fmtDuration(gesamt)}
            </strong>
          </span>
        </div>

        ${
          offen.length
            ? `<div class="notice">
                <strong>Gerade im Dienst:</strong>
                ${offen
                  .map(
                    (s) =>
                      `${esc(
                        s.staff_name,
                      )} (seit ${fmtTime(
                        s.started_at,
                      )}, ${fmtDuration(
                        secs(s) / 1000,
                      )})`,
                  )
                  .join(" · ")}
              </div>`
            : ""
        }

        <div>
          <div class="section-title">
            Dienstzeit je Mitarbeiter
          </div>

          <div class="card">
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>Mitarbeiter</th>
                    <th class="num">Schichten</th>
                    <th class="num">Dienstzeit</th>
                    <th>Anteil</th>
                    <th>Zuletzt</th>
                  </tr>
                </thead>

                <tbody>
                  ${
                    summary.length
                      ? summary
                          .map((e) => {
                            const anteil =
                              gesamt > 0
                                ? Math.round(
                                    (e.seconds /
                                      gesamt) *
                                      100,
                                  )
                                : 0;

                            return `<tr>
                              <td class="strong">
                                ${esc(e.name)}
                                ${
                                  e.open
                                    ? ' <span class="tag ok">im Dienst</span>'
                                    : ""
                                }
                              </td>

                              <td class="num">
                                ${e.count}
                              </td>

                              <td class="num strong">
                                ${fmtDuration(
                                  e.seconds,
                                )}
                              </td>

                              <td>
                                <div
                                  class="bar-track"
                                  title="${anteil} %"
                                >
                                  <div
                                    class="bar-fill"
                                    style="width:${anteil}%"
                                  ></div>
                                </div>
                              </td>

                              <td class="muted">
                                ${
                                  e.last
                                    ? fmtDateTime(
                                        e.last,
                                      )
                                    : "—"
                                }
                              </td>
                            </tr>`;
                          })
                          .join("")
                      : `<tr>
                          <td
                            colspan="5"
                            class="muted"
                            style="padding:var(--space-8);text-align:center"
                          >
                            In diesem Zeitraum war niemand eingestempelt.
                          </td>
                        </tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div class="section-title">
            Alle Schichten
          </div>

          <div class="card">
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>Mitarbeiter</th>
                    <th>Beginn</th>
                    <th>Ende</th>
                    <th class="num">Dauer</th>
                    <th>Hinweis</th>
                  </tr>
                </thead>

                <tbody>
                  ${
                    this.shifts.length
                      ? this.shifts
                          .map((s) => {
                            const dauer =
                              secs(s) / 1000;

                            const lang =
                              dauer >
                              12 * 3600;

                            return `<tr>
                              <td class="strong">
                                ${esc(
                                  s.staff_name,
                                )}
                              </td>

                              <td class="muted">
                                ${fmtDateTime(
                                  s.started_at,
                                )}
                              </td>

                              <td class="muted">
                                ${
                                  s.ended_at
                                    ? fmtDateTime(
                                        s.ended_at,
                                      )
                                    : '<span class="tag ok">läuft</span>'
                                }
                              </td>

                              <td class="num">
                                ${fmtDuration(
                                  dauer,
                                )}
                              </td>

                              <td>
                                ${
                                  lang
                                    ? '<span class="tag warn">über 12 Std — prüfen</span>'
                                    : s.ended_auto
                                    ? '<span class="tag">automatisch beendet</span>'
                                    : '<span class="muted">—</span>'
                                }
                              </td>
                            </tr>`;
                          })
                          .join("")
                      : `<tr>
                          <td
                            colspan="5"
                            class="muted"
                            style="padding:var(--space-8);text-align:center"
                          >
                            Keine Schichten in diesem Zeitraum.
                          </td>
                        </tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>`;

    $("#sh-range").addEventListener(
      "click",
      (e) => {
        const b =
          e.target.closest(
            "button[data-days]",
          );

        if (!b) return;

        this.shiftRange =
          Number(b.dataset.days);

        this.loadTab();
      },
    );
  },

  /* ---------- Personal ---------- */

  renderStaff() {
    $("#admin-body").innerHTML = `
      <div
        class="row"
        style="margin-bottom:var(--space-4)"
      >
        <button
          class="btn btn-primary"
          data-new-staff
        >
          + Neuer Mitarbeiter
        </button>

        <span
          class="muted"
          style="font-size:var(--text-sm)"
        >
          Der PIN dient zum Anmelden an der Kasse.
        </span>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Rolle</th>
                <th>PIN</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              ${this.staff
                .map(
                  (s) => `<tr>
                <td class="strong">
                  ${esc(s.name)}
                </td>

                <td class="muted">
                  ${
                    s.role === "admin"
                      ? "Admin"
                      : "Kasse"
                  }
                </td>

                <td class="muted">
                  ••••
                </td>

                <td>
                  <span
                    class="tag ${
                      s.is_active ? "ok" : ""
                    }"
                  >
                    ${
                      s.is_active
                        ? "Aktiv"
                        : "Inaktiv"
                    }
                  </span>
                </td>

                <td>
                  <div
                    class="row"
                    style="gap:var(--space-2);flex-wrap:nowrap"
                  >
                    <button
                      class="btn btn-sm"
                      data-edit-staff="${s.id}"
                    >
                      Bearbeiten
                    </button>

                    <button
                      class="btn btn-sm btn-danger"
                      data-del-staff="${s.id}"
                    >
                      Löschen
                    </button>
                  </div>
                </td>
              </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  staffForm(s = null) {
    openModal({
      title: s
        ? "Mitarbeiter bearbeiten"
        : "Neuer Mitarbeiter",

      bodyHTML: `
        <div class="field">
          <label for="s-name">Name</label>

          <input
            class="input"
            id="s-name"
            value="${esc(s?.name || "")}"
            placeholder="z. B. Ali"
          >
        </div>

        <div class="field">
          <label for="s-pin">
            PIN (4 Ziffern)
          </label>

          <input
            class="input"
            id="s-pin"
            inputmode="numeric"
            maxlength="4"
            value="${esc(s?.pin || "")}"
            placeholder="1234"
          >
        </div>

        <div class="field">
          <label for="s-role">Rolle</label>

          <select class="select" id="s-role">
            <option
              value="kasse"
              ${s?.role !== "admin" ? "selected" : ""}
            >
              Kasse — nur kassieren
            </option>

            <option
              value="admin"
              ${s?.role === "admin" ? "selected" : ""}
            >
              Admin — Verwaltung und Storno
            </option>
          </select>
        </div>

        <div class="field">
          <label for="s-active">Status</label>

          <select class="select" id="s-active">
            <option
              value="1"
              ${s?.is_active !== false ? "selected" : ""}
            >
              Aktiv
            </option>

            <option
              value="0"
              ${s?.is_active === false ? "selected" : ""}
            >
              Inaktiv
            </option>
          </select>
        </div>
      `,

      footHTML: `
        <button class="btn" data-close>
          Abbrechen
        </button>

        <button
          class="btn btn-primary"
          id="s-save"
        >
          Speichern
        </button>
      `,

      onMount: (root) => {
        $("#s-save", root).addEventListener(
          "click",
          async () => {
            const pin =
              $("#s-pin", root).value.trim();

            const payload = {
              name: $("#s-name", root).value.trim(),
              pin,
              role: $("#s-role", root).value,
              is_active:
                $("#s-active", root).value === "1",
            };

            if (!payload.name) {
              return toast(
                "Bitte einen Namen eingeben",
                "error",
              );
            }

            if (!/^\d{4}$/.test(pin)) {
              return toast(
                "Der PIN muss aus 4 Ziffern bestehen",
                "error",
              );
            }

            try {
              if (s) {
                await DB.updateStaff(
                  s.id,
                  payload,
                );
              } else {
                await DB.createStaff(payload);
              }

              closeModal();
              toast("Gespeichert");

              State.staff =
                await DB.listStaff(true);

              await this.loadTab();
            } catch (err) {
              fail(err);
            }
          },
        );
      },
    });
  },

  /* ---------- Einstellungen ---------- */

  renderSettings() {
    const s = State.settings || {};

    $("#admin-body").innerHTML = `
      <div
        class="card"
        style="max-width:760px"
      >
        <div class="form-grid">

          <div class="field">
            <label for="set-name">
              Name des Imbiss
            </label>

            <input
              class="input"
              id="set-name"
              value="${esc(s.shop_name || "")}"
            >
          </div>

          <div class="field">
            <label for="set-phone">
              Telefon
            </label>

            <input
              class="input"
              id="set-phone"
              value="${esc(s.phone || "")}"
            >
          </div>

          <div
            class="field"
            style="grid-column:1/-1"
          >
            <label for="set-address">
              Adresse
            </label>

            <input
              class="input"
              id="set-address"
              value="${esc(s.address || "")}"
            >
          </div>

          <div class="field">
            <label for="set-tax">
              Steuernummer
            </label>

            <input
              class="input"
              id="set-tax"
              value="${esc(s.tax_id || "")}"
            >
          </div>

          <div class="field">
            <label for="set-vat">
              MwSt.-Satz in Prozent
            </label>

            <input
              class="input"
              id="set-vat"
              type="number"
              step="0.5"
              min="0"
              value="${Number(
                s.vat_rate ?? 19,
              )}"
            >
          </div>

          <div
            class="field"
            style="grid-column:1/-1"
          >
            <label for="set-footer">
              Text unten auf dem Bon
            </label>

            <input
              class="input"
              id="set-footer"
              value="${esc(
                s.receipt_footer || "",
              )}"
            >
          </div>

        </div>

        <div class="form-actions">
          <button
            class="btn btn-primary"
            id="set-save"
          >
            Einstellungen speichern
          </button>
        </div>
      </div>`;

    $("#set-save").addEventListener(
      "click",
      async () => {
        try {
          State.settings =
            await DB.saveSettings({
              shop_name:
                $("#set-name").value.trim() ||
                "Masora Döner",

              phone:
                $("#set-phone").value.trim(),

              address:
                $("#set-address").value.trim(),

              tax_id:
                $("#set-tax").value.trim(),

              vat_rate:
                num($("#set-vat").value),

              receipt_footer:
                $("#set-footer").value.trim(),
            });

          App.paintBrand();
          Kasse.renderCart();

          toast("Einstellungen gespeichert");
        } catch (err) {
          fail(err);
        }
      },
    );
  },

  /* ---------- Tagesabschluss ---------- */

  renderClosing(orders) {
    const valid = orders.filter(
      (o) => o.status !== "storniert",
    );

    const sum = (arr) =>
      num(
        arr.reduce(
          (s, o) => s + Number(o.total),
          0,
        ),
      );

    const cash = valid.filter(
      (o) => o.payment_method === "bar",
    );

    const card = valid.filter(
      (o) => o.payment_method === "karte",
    );

    const rate = Number(
      State.settings?.vat_rate ?? 19,
    );

    const revenue = sum(valid);

    const vat = num(
      revenue -
        revenue / (1 + rate / 100),
    );

    const discounts = num(
      valid.reduce(
        (s, o) =>
          s + Number(o.discount_amount),
        0,
      ),
    );

    const perProduct = {};

    valid.forEach((o) =>
      (o.items || []).forEach((i) => {
        if (!perProduct[i.name]) {
          perProduct[i.name] = {
            qty: 0,
            total: 0,
          };
        }

        perProduct[i.name].qty +=
          Number(i.qty);

        perProduct[i.name].total = num(
          perProduct[i.name].total +
            Number(i.line_total),
        );
      }),
    );

    const top = Object.entries(
      perProduct,
    ).sort(
      (a, b) => b[1].qty - a[1].qty,
    );

    // Umsatz je Mitarbeiter
    const perStaff = new Map();

    valid.forEach((o) => {
      const key =
        o.staff_id ||
        o.staff_name ||
        "unbekannt";

      if (!perStaff.has(key)) {
        perStaff.set(key, {
          name:
            o.staff_name ||
            "Ohne Zuordnung",

          total: 0,
          count: 0,
          cash: 0,
          card: 0,
        });
      }

      const e = perStaff.get(key);

      e.count += 1;

      e.total = num(
        e.total + Number(o.total),
      );

      if (o.payment_method === "bar") {
        e.cash = num(
          e.cash + Number(o.total),
        );
      } else {
        e.card = num(
          e.card + Number(o.total),
        );
      }
    });

    const staffRows = [
      ...perStaff.values(),
    ].sort(
      (a, b) => b.total - a.total,
    );

    const today =
      new Date().toLocaleDateString(
        "de-DE",
        {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        },
      );

    $("#admin-body").innerHTML = `
      <div class="stack">

        <div>
          <div class="section-title">
            Tagesabschluss · ${esc(today)}
          </div>

          <div
            class="stats"
            style="margin-bottom:0"
          >
            <div class="stat accent">
              <div class="stat-label">
                Tagesumsatz
              </div>

              <div class="stat-value">
                ${money(revenue)}
              </div>
            </div>

            <div class="stat">
              <div class="stat-label">
                Bestellungen
              </div>

              <div class="stat-value">
                ${valid.length}
              </div>
            </div>

            <div class="stat">
              <div class="stat-label">
                Bar
              </div>

              <div class="stat-value">
                ${money(sum(cash))}
              </div>
            </div>

            <div class="stat">
              <div class="stat-label">
                Karte
              </div>

              <div class="stat-value">
                ${money(sum(card))}
              </div>
            </div>

            <div class="stat">
              <div class="stat-label">
                enth. MwSt. ${rate}%
              </div>

              <div class="stat-value">
                ${money(vat)}
              </div>
            </div>

            <div class="stat">
              <div class="stat-label">
                Rabatte
              </div>

              <div class="stat-value">
                ${money(discounts)}
              </div>
            </div>

            <div class="stat">
              <div class="stat-label">
                Stornos
              </div>

              <div class="stat-value">
                ${
                  orders.length -
                  valid.length
                }
              </div>
            </div>
          </div>
        </div>

        <div>
          <div class="section-title">
            Umsatz je Mitarbeiter
          </div>

          <div class="card">
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>Mitarbeiter</th>
                    <th class="num">
                      Bestellungen
                    </th>
                    <th class="num">
                      Bar
                    </th>
                    <th class="num">
                      Karte
                    </th>
                    <th class="num">
                      Umsatz
                    </th>
                    <th>Anteil</th>
                  </tr>
                </thead>

                <tbody>
                  ${
                    staffRows.length
                      ? staffRows
                          .map((e) => {
                            const anteil =
                              revenue > 0
                                ? Math.round(
                                    (e.total /
                                      revenue) *
                                      100,
                                  )
                                : 0;

                            return `<tr>
                              <td class="strong">
                                ${esc(e.name)}
                              </td>

                              <td class="num">
                                ${e.count}
                              </td>

                              <td class="num">
                                ${money(e.cash)}
                              </td>

                              <td class="num">
                                ${money(e.card)}
                              </td>

                              <td class="num strong">
                                ${money(e.total)}
                              </td>

                              <td>
                                <div
                                  class="bar-track"
                                  title="${anteil} %"
                                >
                                  <div
                                    class="bar-fill"
                                    style="width:${anteil}%"
                                  ></div>
                                </div>
                              </td>
                            </tr>`;
                          })
                          .join("")
                      : `<tr>
                          <td
                            colspan="6"
                            class="muted"
                            style="padding:var(--space-8);text-align:center"
                          >
                            Heute hat noch niemand verkauft.
                          </td>
                        </tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div class="section-title">
            Verkaufte Artikel
          </div>

          <div class="card">
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>Artikel</th>
                    <th class="num">
                      Menge
                    </th>
                    <th class="num">
                      Umsatz
                    </th>
                  </tr>
                </thead>

                <tbody>
                  ${
                    top.length
                      ? top
                          .map(
                            ([name, v]) =>
                              `<tr>
                                <td>
                                  ${esc(name)}
                                </td>

                                <td class="num">
                                  ${v.qty}
                                </td>

                                <td class="num">
                                  ${money(v.total)}
                                </td>
                              </tr>`,
                          )
                          .join("")
                      : `<tr>
                          <td
                            colspan="3"
                            class="muted"
                            style="padding:var(--space-8);text-align:center"
                          >
                            Heute wurde noch nichts verkauft.
                          </td>
                        </tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>`;
  },

  async refreshKasse() {
    State.products =
      await DB.listProducts(true);

    State.discounts =
      await DB.listDiscounts(true);

    State.coops =
      await DB.listCoops(true);

    if (
      State.coop &&
      !State.coops.some(
        (c) => c.id === State.coop.id,
      )
    ) {
      State.coop = null;
    }

    if (
      State.discountId &&
      !State.discounts.some(
        (d) =>
          d.id === State.discountId,
      )
    ) {
      State.discountId = "";
    }

    State.cart = State.cart.filter(
      (l) =>
        State.products.some(
          (p) =>
            p.id === l.product_id,
        ),
    );

    Kasse.render();
  },

  /* ---------- Events ---------- */

  bind() {
    $("#admin-subnav").addEventListener(
      "click",
      (e) => {
        const b =
          e.target.closest(
            "button[data-tab]",
          );

        if (!b) return;

        this.tab = b.dataset.tab;

        this.paintTabs();
        this.loadTab();
      },
    );

    $("#admin-body").addEventListener(
      "click",
      async (e) => {
        const t = e.target;

        if (
          t.closest("[data-new-product]")
        ) {
          return this.productForm();
        }

        if (
          t.closest("[data-new-discount]")
        ) {
          return this.discountForm();
        }

        if (
          t.closest("[data-new-staff]")
        ) {
          return this.staffForm();
        }

        if (
          t.closest("[data-new-coop]")
        ) {
          return this.coopForm();
        }

        const ec =
          t.closest("[data-edit-coop]");

        if (ec) {
          return this.coopForm(
            this.coops.find(
              (c) =>
                c.id ===
                ec.dataset.editCoop,
            ),
          );
        }

        const sb =
          t.closest("[data-stock-book]");

        if (sb) {
          const p =
            this.products.find(
              (x) =>
                x.id ===
                sb.dataset.stockBook,
            );

          if (p) {
            this.stockForm(p);
          }

          return;
        }

        const dc =
          t.closest("[data-del-coop]");

        if (dc) {
          const c =
            this.coops.find(
              (x) =>
                x.id ===
                dc.dataset.delCoop,
            );

          if (
            c &&
            (await confirmDialog(
              "Kooperation löschen?",
              `„${c.name}" wird entfernt. Das Codewort „${c.code}" gilt danach nicht mehr.`,
              "Löschen",
            ))
          ) {
            try {
              await DB.deleteCoop(c.id);

              toast(
                "Kooperation gelöscht",
              );

              await this.loadTab();
              await this.refreshKasse();
            } catch (err) {
              fail(err);
            }
          }

          return;
        }

        const ep =
          t.closest(
            "[data-edit-product]",
          );

        if (ep) {
          return this.productForm(
            this.products.find(
              (p) =>
                p.id ===
                ep.dataset.editProduct,
            ),
          );
        }

        const ed =
          t.closest(
            "[data-edit-discount]",
          );

        if (ed) {
          return this.discountForm(
            this.discounts.find(
              (d) =>
                d.id ===
                ed.dataset.editDiscount,
            ),
          );
        }

        const es =
          t.closest(
            "[data-edit-staff]",
          );

        if (es) {
          return this.staffForm(
            this.staff.find(
              (s) =>
                s.id ===
                es.dataset.editStaff,
            ),
          );
        }

        const dp =
          t.closest(
            "[data-del-product]",
          );

        if (dp) {
          const p =
            this.products.find(
              (x) =>
                x.id ===
                dp.dataset.delProduct,
            );

          if (
            p &&
            (await confirmDialog(
              "Produkt löschen?",
              `„${p.name}" wird endgültig entfernt.`,
              "Löschen",
            ))
          ) {
            try {
              await DB.deleteProduct(
                p.id,
              );

              toast(
                "Produkt gelöscht",
              );

              await this.loadTab();
              await this.refreshKasse();
            } catch (err) {
              fail(err);
            }
          }

          return;
        }

        const dd =
          t.closest(
            "[data-del-discount]",
          );

        if (dd) {
          const d =
            this.discounts.find(
              (x) =>
                x.id ===
                dd.dataset.delDiscount,
            );

          if (
            d &&
            (await confirmDialog(
              "Rabatt löschen?",
              `„${d.name}" wird entfernt.`,
              "Löschen",
            ))
          ) {
            try {
              await DB.deleteDiscount(
                d.id,
              );

              toast("Rabatt gelöscht");

              await this.loadTab();
              await this.refreshKasse();
            } catch (err) {
              fail(err);
            }
          }

          return;
        }

        const ds =
          t.closest(
            "[data-del-staff]",
          );

        if (ds) {
          const s =
            this.staff.find(
              (x) =>
                x.id ===
                ds.dataset.delStaff,
            );

          if (!s) return;

          if (
            s.id === State.user?.id
          ) {
            return toast(
              "Das eigene Konto kann nicht gelöscht werden",
              "error",
            );
          }

          if (
            await confirmDialog(
              "Mitarbeiter löschen?",
              `„${s.name}" wird entfernt.`,
              "Löschen",
            )
          ) {
            try {
              await DB.deleteStaff(
                s.id,
              );

              toast(
                "Mitarbeiter gelöscht",
              );

              State.staff =
                await DB.listStaff(
                  true,
                );

              await this.loadTab();
            } catch (err) {
              fail(err);
            }
          }
        }
      },
    );
  },
};

window.Admin = Admin;
