/* ==========================================================================
   App-Kern: State, Hilfsfunktionen, Login, Navigation, Branding
   ========================================================================== */
"use strict";

/* ==========================================================================
   State
   ========================================================================== */

const State = {
  user: null,
  products: [],
  discounts: [],
  staff: [],
  settings: null,
  cart: [],
  discountId: "",
  coop: null,
  shift: null,
  category: null,
  view: "kasse",
  userRole: null,
};

const SESSION_MINUTES = 60;

/* ==========================================================================
   Hilfsfunktionen
   ========================================================================== */

const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

const money = (value) => euro.format(Number(value) || 0);

const num = (value) =>
  Math.round((Number(value) || 0) * 100) / 100;

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (hours > 0) {
    return `${hours} Std ${String(minutes).padStart(2, "0")} Min`;
  }

  return `${minutes} Min`;
}

function fmtClock(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));

  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
    value % 60,
  ).padStart(2, "0")}`;
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function isValidColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || ""));
}

function normalizeColor(value, fallback) {
  return isValidColor(value) ? value : fallback;
}

function toast(message, kind = "") {
  const wrapper = $("#toasts");

  if (!wrapper) {
    console.log(message);
    return;
  }

  const element = document.createElement("div");
  element.className = "toast" + (kind ? ` ${kind}` : "");
  element.textContent = message;

  wrapper.appendChild(element);

  setTimeout(() => {
    element.remove();
  }, 3200);
}

function fail(error) {
  console.error(error);

  toast(
    error?.message || "Ein Fehler ist aufgetreten",
    "error",
  );
}

/* ==========================================================================
   Modal
   ========================================================================== */

let modalKeyHandler = null;

function openModal({
  title,
  bodyHTML,
  footHTML = "",
  onMount = null,
  wide = false,
}) {
  closeModal();

  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.id = "modal-overlay";

  overlay.innerHTML = `
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="${esc(title)}"
      ${wide ? 'style="max-width:720px"' : ""}
    >
      <div class="modal-head">
        <h2 class="modal-title">${esc(title)}</h2>

        <button
          class="icon-btn"
          type="button"
          data-close
          aria-label="Schließen"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        ${bodyHTML}
      </div>

      ${
        footHTML
          ? `<div class="modal-foot">${footHTML}</div>`
          : ""
      }
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (
      event.target === overlay ||
      event.target.closest("[data-close]")
    ) {
      closeModal();
    }
  });

  modalKeyHandler = (event) => {
    if (event.key === "Escape") {
      closeModal();
    }
  };

  document.addEventListener("keydown", modalKeyHandler);

  if (typeof onMount === "function") {
    onMount(overlay);
  }

  return overlay;
}

function closeModal() {
  const modal = $("#modal-overlay");

  if (modal) {
    modal.remove();
  }

  if (modalKeyHandler) {
    document.removeEventListener("keydown", modalKeyHandler);
    modalKeyHandler = null;
  }
}

/* ==========================================================================
   Bestätigung
   ========================================================================== */

function confirmDialog(
  title,
  text,
  confirmLabel = "Bestätigen",
) {
  return new Promise((resolve) => {
    let answered = false;

    const finish = (value) => {
      if (answered) return;
      answered = true;
      resolve(value);
    };

    openModal({
      title,
      bodyHTML: `
        <p style="font-size:var(--text-sm)">
          ${esc(text)}
        </p>
      `,
      footHTML: `
        <button class="btn" type="button" data-close>
          Abbrechen
        </button>

        <button
          class="btn btn-primary"
          type="button"
          data-yes
        >
          ${esc(confirmLabel)}
        </button>
      `,
      onMount(root) {
        $("[data-yes]", root)?.addEventListener(
          "click",
          () => {
            closeModal();
            finish(true);
          },
        );

        $("[data-close]", root)?.addEventListener(
          "click",
          () => finish(false),
        );
      },
    });
  });
}

/* ==========================================================================
   Login
   ========================================================================== */

const Login = {
  pin: "",

  show(message = "") {
    $("#login")?.classList.remove("hidden");
    $("#app")?.classList.add("hidden");

    this.pin = "";
    this.paint();

    const errorElement = $("#login-error");

    if (errorElement) {
      errorElement.textContent = message;
    }
  },

  hide() {
    $("#login")?.classList.add("hidden");
    $("#app")?.classList.remove("hidden");
  },

  paint() {
    $$("#pin-display .pin-dot").forEach((dot, index) => {
      dot.classList.toggle(
        "filled",
        index < this.pin.length,
      );
    });
  },

  press(key) {
    const errorElement = $("#login-error");

    if (errorElement) {
      errorElement.textContent = "";
    }

    if (key === "del") {
      this.pin = this.pin.slice(0, -1);
    } else if (key === "clear") {
      this.pin = "";
    } else if (
      /^[0-9]$/.test(String(key)) &&
      this.pin.length < 4
    ) {
      this.pin += key;
    }

    this.paint();

    if (this.pin.length === 4) {
      setTimeout(() => this.submit(), 120);
    }
  },

  async submit() {
    const errorElement = $("#login-error");

    const match = State.staff.find(
      (staff) =>
        String(staff.pin) === this.pin &&
        staff.is_active,
    );

    if (!match) {
      if (errorElement) {
        errorElement.textContent = "PIN nicht erkannt";
      }

      this.pin = "";
      this.paint();
      return;
    }

    State.user = match;
    this.hide();

    await App.afterLogin();
  },

  bind() {
    $("#pin-pad")?.addEventListener("click", (event) => {
      const button = event.target.closest(
        "button[data-key]",
      );

      if (button) {
        this.press(button.dataset.key);
      }
    });

    document.addEventListener("keydown", (event) => {
      if ($("#login")?.classList.contains("hidden")) {
        return;
      }

      if (/^[0-9]$/.test(event.key)) {
        this.press(event.key);
      } else if (event.key === "Backspace") {
        this.press("del");
      } else if (event.key === "Escape") {
        this.press("clear");
      }
    });
  },
};

/* ==========================================================================
   Dienst und Sitzung
   ========================================================================== */

const Duty = {
  deadline: 0,
  ticker: null,
  warned: false,

  isOn() {
    return Boolean(
      State.shift && !State.shift.ended_at,
    );
  },

  async load() {
    State.shift = null;

    if (!State.user) {
      this.paint();
      return;
    }

    try {
      const openShift = await DB.openShift(
        State.user.id,
      );

      /*
       * Eine alte offene Schicht wird nicht automatisch
       * übernommen. Der Mitarbeiter stempelt manuell ein.
       */
      if (
        openShift &&
        openShift.ended_at === null
      ) {
        State.shift = null;
      }
    } catch (error) {
      console.error(
        "Fehler beim Laden der Schicht:",
        error,
      );
    }

    this.paint();
  },

  async clockIn() {
    if (!State.user || this.isOn()) {
      return;
    }

    try {
      State.shift = await DB.clockIn(
        State.user.id,
        State.user.name,
      );

      this.paint();

      toast(
        `Eingestempelt um ${fmtTime(
          State.shift.started_at,
        )}`,
      );
    } catch (error) {
      fail(error);
    }
  },

  async clockOut(auto = false) {
    if (!this.isOn()) {
      return null;
    }

    const shiftId = State.shift.id;
    const startedAt = State.shift.started_at;

    try {
      await DB.clockOut(shiftId, auto);
    } catch (error) {
      console.error(error);

      if (!auto) {
        fail(error);
        return null;
      }
    }

    State.shift = null;
    this.paint();

    const worked = fmtDuration(
      (Date.now() - new Date(startedAt).getTime()) /
        1000,
    );

    if (!auto) {
      toast(`Ausgestempelt — Dienstzeit ${worked}`);
    }

    return worked;
  },

  paint() {
    const chip = $("#duty-chip");
    const button = $("#duty-toggle");

    if (!chip || !button) {
      return;
    }

    const onDuty = this.isOn();

    chip.classList.toggle("on", onDuty);
    chip.classList.toggle("off", !onDuty);

    $("#duty-banner")?.classList.toggle(
      "hidden",
      onDuty,
    );

    if (onDuty) {
      const seconds =
        (Date.now() -
          new Date(
            State.shift.started_at,
          ).getTime()) /
        1000;

      $("#duty-state").textContent = "Im Dienst";
      $("#duty-since").textContent =
        `seit ${fmtTime(
          State.shift.started_at,
        )} · ${fmtDuration(seconds)}`;

      button.textContent = "Ausstempeln";
      button.classList.remove("btn-primary");
    } else {
      $("#duty-state").textContent =
        "Nicht im Dienst";

      $("#duty-since").textContent =
        "Zum Kassieren bitte einstempeln";

      button.textContent = "Einstempeln";
      button.classList.add("btn-primary");
    }
  },

  startSession() {
    this.stopSession();

    this.warned = false;
    this.deadline =
      Date.now() + SESSION_MINUTES * 60 * 1000;

    this.ticker = setInterval(
      () => this.tick(),
      1000,
    );

    this.tick();
  },

  stopSession() {
    if (this.ticker) {
      clearInterval(this.ticker);
    }

    this.ticker = null;
  },

  tick() {
    const remaining = Math.max(
      0,
      (this.deadline - Date.now()) / 1000,
    );

    const element = $("#session-left");

    if (element) {
      element.textContent = fmtClock(remaining);
      element.classList.toggle(
        "warn",
        remaining <= 300,
      );
    }

    if (this.isOn()) {
      this.paint();
    }

    if (
      remaining <= 300 &&
      !this.warned
    ) {
      this.warned = true;

      toast(
        "Die Kasse meldet sich in 5 Minuten automatisch ab",
        "error",
      );
    }

    if (remaining <= 0) {
      this.stopSession();
      this.autoLogout();
    }
  },

  async autoLogout() {
    const userName = State.user?.name || "";
    const worked = await this.clockOut(true);

    await App.logout({
      auto: true,
    });

    const message = worked
      ? `${userName} nach ${SESSION_MINUTES} Minuten automatisch abgemeldet · Dienstzeit ${worked}`
      : `Nach ${SESSION_MINUTES} Minuten automatisch abgemeldet`;

    Login.show(message);
  },

  requireDuty() {
    if (this.isOn()) {
      return true;
    }

    openModal({
      title: "Du bist nicht im Dienst",
      bodyHTML: `
        <p style="font-size:var(--text-sm)">
          Bevor du eine Bestellung kassieren kannst,
          musst du dich einstempeln.
        </p>

        <p
          class="muted"
          style="font-size:var(--text-sm);margin-top:var(--space-3)"
        >
          Der Warenkorb bleibt erhalten.
        </p>
      `,
      footHTML: `
        <button class="btn" type="button" data-close>
          Abbrechen
        </button>

        <button
          class="btn btn-primary"
          type="button"
          id="duty-now"
        >
          Jetzt einstempeln
        </button>
      `,
      onMount(root) {
        $("#duty-now", root)?.addEventListener(
          "click",
          async () => {
            closeModal();
            await Duty.clockIn();
          },
        );
      },
    });

    return false;
  },

  bind() {
    $("#duty-toggle")?.addEventListener(
      "click",
      async () => {
        if (this.isOn()) {
          const confirmed = await confirmDialog(
            "Dienst beenden?",
            "Du wirst ausgestempelt. Zum Kassieren musst du dich danach wieder einstempeln.",
            "Ausstempeln",
          );

          if (confirmed) {
            await this.clockOut(false);
          }
        } else {
          await this.clockIn();
        }
      },
    );
  },
};

/* ==========================================================================
   App
   ========================================================================== */

const App = {
  async boot() {
    this.bindTheme();
    Login.bind();
    this.bindNav();
    Duty.bind();

    try {
      const [staff, settings] =
        await Promise.all([
          DB.listStaff(true),
          DB.getSettings(),
        ]);

      State.staff = staff;
      State.settings = settings;

      this.paintBrand();
      this.paintTheme();
      this.paintLogo();

      Login.show();

      const hint = $("#login-hint");

      if (hint && !staff.length) {
        hint.textContent =
          "Kein Personal angelegt. Bitte in der Datenbank einen PIN hinterlegen.";
      }
    } catch (error) {
      fail(error);

      const loginError = $("#login-error");

      if (loginError) {
        loginError.textContent =
          "Keine Verbindung zur Datenbank";
      }
    }
  },

  paintBrand() {
    const settings = State.settings || {};

    const name =
      String(settings.business_name || "").trim() ||
      "Masora Döner";

    $$(".business-name-display").forEach(
      (element) => {
        element.textContent = name;
      },
    );

    document.title = `${name} — Kasse`;
  },

  paintTheme() {
    const settings = State.settings || {};
    const root = document.documentElement;

    const primary = normalizeColor(
      settings.primary_color,
      "#e95420",
    );

    const accent = normalizeColor(
      settings.accent_color,
      "#e35d6a",
    );

    root.style.setProperty(
      "--brand-primary",
      primary,
    );

    root.style.setProperty(
      "--brand-accent",
      accent,
    );

    root.style.setProperty(
      "--color-primary",
      primary,
    );

    root.style.setProperty(
      "--color-accent",
      accent,
    );

    root.style.setProperty(
      "--accent",
      accent,
    );

    root.style.setProperty(
      "--primary",
      primary,
    );

    /*
     * Falls dein bestehendes CSS diese Variablen benutzt,
     * werden dadurch auch Buttons, aktive Tabs und Akzente geändert.
     */
  },

  paintLogo() {
    const settings = State.settings || {};
    const name =
      String(settings.business_name || "").trim() ||
      "Masora Döner";

    const logoUrl =
      String(settings.logo_url || "").trim();

    $$(".business-logo").forEach((container) => {
      if (!logoUrl) {
        container.innerHTML = `
          <span
            class="default-logo"
            aria-hidden="true"
          >
            🍢
          </span>
        `;

        container.classList.remove("has-image");
        return;
      }

      container.innerHTML = `
        <img
          src="${esc(logoUrl)}"
          alt="${esc(name)} Logo"
          loading="eager"
          onerror="this.parentElement.innerHTML='<span class=&quot;default-logo&quot; aria-hidden=&quot;true&quot;>🍢</span>';"
        />
      `;

      container.classList.add("has-image");
    });
  },

  async afterLogin() {
    $("#user-name").textContent =
      State.user.name;

    const roleNames = {
      admin: "Admin",
      service: "Serviceleitung",
      lager: "Lager",
      kasse: "Kasse",
    };

    $("#user-role").textContent =
      roleNames[State.user.role] || "Kasse";

    State.userRole = State.user.role;

    const adminNavigation = $("#nav-admin");

    if (adminNavigation) {
      adminNavigation.classList.toggle(
        "hidden",
        ![
          "admin",
          "service",
          "lager",
        ].includes(State.user.role),
      );
    }

    try {
      const [products, discounts] =
        await Promise.all([
          DB.listProducts(true),
          DB.listDiscounts(true),
        ]);

      State.products = products;
      State.discounts = discounts;

      await Duty.load();
      Duty.startSession();

      Kasse.render();
      this.go("kasse");
    } catch (error) {
      fail(error);
    }
  },

  async logout({ auto = false } = {}) {
    if (!auto && Duty.isOn()) {
      const confirmed = await confirmDialog(
        "Abmelden und ausstempeln?",
        "Du bist noch im Dienst. Beim Abmelden wirst du ausgestempelt.",
        "Abmelden",
      );

      if (!confirmed) {
        return;
      }

      await Duty.clockOut(false);
    }

    Duty.stopSession();

    State.user = null;
    State.shift = null;
    State.cart = [];
    State.discountId = "";
    State.coop = null;
    State.userRole = null;

    closeModal();
    Login.show();
  },

  bindNav() {
    $("#nav")?.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest(
          "button[data-view]",
        );

        if (button) {
          this.go(button.dataset.view);
        }
      },
    );

    $("#logout")?.addEventListener(
      "click",
      () => this.logout(),
    );

    $("#duty-banner-btn")?.addEventListener(
      "click",
      () => Duty.clockIn(),
    );
  },

  go(view) {
    State.view = view;

    $$("#nav button[data-view]").forEach(
      (button) => {
        button.setAttribute(
          "aria-current",
          String(button.dataset.view === view),
        );
      },
    );

    $$(".view").forEach((panel) => {
      panel.classList.toggle(
        "hidden",
        panel.dataset.viewPanel !== view,
      );
    });

    if (view === "bestellungen") {
      Orders.load();
    }

    if (view === "verwaltung") {
      Admin.open();
    }
  },

  bindTheme() {
    const root = document.documentElement;

    let mode = matchMedia(
      "(prefers-color-scheme: light)",
    ).matches
      ? "light"
      : "dark";

    const paint = () => {
      root.setAttribute("data-theme", mode);

      $$("[data-theme-toggle]").forEach(
        (toggle) => {
          toggle.setAttribute(
            "aria-label",
            mode === "dark"
              ? "Zu hellem Design wechseln"
              : "Zu dunklem Design wechseln",
          );

          toggle.innerHTML =
            mode === "dark"
              ? `
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <circle cx="12" cy="12" r="4.5" />
                  <path
                    d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
                  />
                </svg>
              `
              : `
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                >
                  <path
                    d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"
                  />
                </svg>
              `;
        },
      );
    };

    paint();

    $$("[data-theme-toggle]").forEach(
      (toggle) => {
        toggle.addEventListener("click", () => {
          mode =
            mode === "dark"
              ? "light"
              : "dark";

          paint();
        });
      },
    );
  },
};

/* ==========================================================================
   Discord-Quittung über Cloudflare
