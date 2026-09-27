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

const ACCENT_PRESETS = {
  paprika: {
    primary: "#e25a24",
    hover: "#f1723c",
    active: "#bf4316",
    soft: "rgba(226, 90, 36, 0.14)",
    accent: "#e25a24",
  },
  red: {
    primary: "#d94c58",
    hover: "#e66a74",
    active: "#ad3340",
    soft: "rgba(217, 76, 88, 0.14)",
    accent: "#d94c58",
  },
  gold: {
    primary: "#d89b28",
    hover: "#e7b34d",
    active: "#ad7716",
    soft: "rgba(216, 155, 40, 0.15)",
    accent: "#d89b28",
  },
  green: {
    primary: "#55a86a",
    hover: "#72be84",
    active: "#3b814e",
    soft: "rgba(85, 168, 106, 0.15)",
    accent: "#55a86a",
  },
  blue: {
    primary: "#4e8edc",
    hover: "#70a7eb",
    active: "#356ead",
    soft: "rgba(78, 142, 220, 0.15)",
    accent: "#4e8edc",
  },
  purple: {
    primary: "#8a6bd1",
    hover: "#a68be1",
    active: "#684ba8",
    soft: "rgba(138, 107, 209, 0.15)",
    accent: "#8a6bd1",
  },
};

const DEFAULT_SETTINGS = window.DEFAULT_SETTINGS || {
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
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

function normalizeColor(value, fallback) {
  return isValidColor(value) ? String(value).trim() : fallback;
}

function getSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...(State.settings || {}),
  };
}

function getSessionMinutes() {
  const value = Number(getSettings().session_timeout_minutes);

  return [15, 30, 60, 120].includes(value) ? value : 30;
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

  toast(error?.message || "Ein Fehler ist aufgetreten", "error");
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

      ${footHTML ? `<div class="modal-foot">${footHTML}</div>` : ""}
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-close]")) {
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

function confirmDialog(title, text, confirmLabel = "Bestätigen") {
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

        <button class="btn btn-primary" type="button" data-yes>
          ${esc(confirmLabel)}
        </button>
      `,
      onMount(root) {
        $("[data-yes]", root)?.addEventListener("click", () => {
          closeModal();
          finish(true);
        });

        $("[data-close]", root)?.addEventListener("click", () => {
          finish(false);
        });
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
      dot.classList.toggle("filled", index < this.pin.length);
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
    } else if (/^[0-9]$/.test(String(key)) && this.pin.length < 4) {
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
      (staff) => String(staff.pin) === this.pin && staff.is_active,
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
      const button = event.target.closest("button[data-key]");

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
    return Boolean(State.shift && !State.shift.ended_at);
  },

  async load() {
    State.shift = null;

    if (!State.user) {
      this.paint();
      return;
    }

    try {
      const openShift = await DB.openShift(State.user.id);

      /*
       * Eine alte offene Schicht wird nicht automatisch übernommen.
       * Mitarbeitende stempeln sich bewusst neu ein.
       */
      if (openShift && openShift.ended_at === null) {
        State.shift = null;
      }
    } catch (error) {
      console.error("Fehler beim Laden der Schicht:", error);
    }

    this.paint();
  },

  async clockIn() {
    if (!State.user || this.isOn()) {
      return;
    }

    try {
      State.shift = await DB.clockIn(State.user.id, State.user.name);

      this.paint();

      toast(`Eingestempelt um ${fmtTime(State.shift.started_at)}`);
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
      (Date.now() - new Date(startedAt).getTime()) / 1000,
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

    $("#duty-banner")?.classList.toggle("hidden", onDuty);

    if (onDuty) {
      const seconds =
        (Date.now() - new Date(State.shift.started_at).getTime()) / 1000;

      $("#duty-state").textContent = "Im Dienst";
      $("#duty-since").textContent =
        `seit ${fmtTime(State.shift.started_at)} · ${fmtDuration(seconds)}`;

      button.textContent = "Ausstempeln";
      button.classList.remove("btn-primary");
    } else {
      $("#duty-state").textContent = "Nicht im Dienst";
      $("#duty-since").textContent =
        "Zum Kassieren bitte einstempeln";

      button.textContent = "Einstempeln";
      button.classList.add("btn-primary");
    }
  },

  startSession() {
    this.stopSession();

    this.warned = false;

    this.deadline = Date.now() + getSessionMinutes() * 60 * 1000;

    this.ticker = setInterval(() => this.tick(), 1000);

    this.tick();
  },

  stopSession() {
    if (this.ticker) {
      clearInterval(this.ticker);
    }

    this.ticker = null;
  },

  tick() {
    const remaining = Math.max(0, (this.deadline - Date.now()) / 1000);
    const element = $("#session-left");

    if (element) {
      element.textContent = fmtClock(remaining);
      element.classList.toggle("warn", remaining <= 300);
    }

    if (this.isOn()) {
      this.paint();
    }

    if (remaining <= 300 && !this.warned) {
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
    const minutes = getSessionMinutes();
    const worked = await this.clockOut(true);

    await App.logout({ auto: true });

    const message = worked
      ? `${userName} nach ${minutes} Minuten automatisch abgemeldet · Dienstzeit ${worked}`
      : `Nach ${minutes} Minuten automatisch abgemeldet`;

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
        $("#duty-now", root)?.addEventListener("click", async () => {
          closeModal();
          await Duty.clockIn();
        });
      },
    });

    return false;
  },

  bind() {
    $("#duty-toggle")?.addEventListener("click", async () => {
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
    });
  },
};

/* ==========================================================================
   App
   ========================================================================== */

const App = {
  systemThemeQuery: null,
  systemThemeHandler: null,

  async boot() {
    Login.bind();
    this.bindNav();
    this.bindTheme();
    Duty.bind();

    try {
      const [staff, settings] = await Promise.all([
        DB.listStaff(true),
        DB.getSettings(),
      ]);

      State.staff = staff;
      State.settings = {
        ...DEFAULT_SETTINGS,
        ...settings,
      };

      this.applySettings();
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
        loginError.textContent = "Keine Verbindung zur Datenbank";
      }
    }
  },

  applySettings() {
    this.paintBrand();
    this.paintTheme();
    this.paintLogo();
    this.paintCompactMode();
    this.paintVatVisibility();
    this.paintDefaultPayment();
  },

  paintBrand() {
    const settings = getSettings();

    const name =
      String(settings.business_name || "").trim() ||
      DEFAULT_SETTINGS.business_name;

    const subtitle =
      String(settings.business_subtitle || "").trim() ||
      DEFAULT_SETTINGS.business_subtitle;

    $$(".business-name-display").forEach((element) => {
      element.textContent = name;
    });

    $$(".business-subtitle-display").forEach((element) => {
      element.textContent = subtitle;
    });

    document.title = `${name} — Kasse`;
  },

  paintTheme() {
    const settings = getSettings();
    const root = document.documentElement;

    const preset =
      ACCENT_PRESETS[settings.accent_preset] ||
      ACCENT_PRESETS.paprika;

    const primary = isValidColor(settings.primary_color)
      ? normalizeColor(settings.primary_color, preset.primary)
      : preset.primary;

    const accent = isValidColor(settings.accent_color)
      ? normalizeColor(settings.accent_color, preset.accent)
      : preset.accent;

    root.style.setProperty("--brand-primary", primary);
    root.style.setProperty("--brand-accent", accent);

    root.style.setProperty("--color-primary", primary);
    root.style.setProperty("--color-primary-hover", preset.hover);
    root.style.setProperty("--color-primary-active", preset.active);
    root.style.setProperty("--color-primary-soft", preset.soft);
    root.style.setProperty("--color-accent", accent);

    root.style.setProperty("--accent", accent);
    root.style.setProperty("--primary", primary);

    this.applyThemeMode(settings.theme_mode);
  },

  applyThemeMode(mode) {
    const root = document.documentElement;
    const preferredMode =
      mode === "light" || mode === "dark"
        ? mode
        : "system";

    const systemIsLight = window.matchMedia(
      "(prefers-color-scheme: light)",
    ).matches;

    const activeMode =
      preferredMode === "system"
        ? systemIsLight
          ? "light"
          : "dark"
        : preferredMode;

    root.setAttribute("data-theme", activeMode);
    root.dataset.themeMode = preferredMode;

    this.paintThemeToggleIcon(activeMode, preferredMode);
  },

  paintThemeToggleIcon(activeMode, preferredMode) {
    $$("[data-theme-toggle]").forEach((toggle) => {
      const modeLabel =
        preferredMode === "system"
          ? "Systemdesign aktiv"
          : activeMode === "dark"
            ? "Dunkles Design aktiv"
            : "Helles Design aktiv";

      toggle.setAttribute(
        "aria-label",
        `${modeLabel} — Design wechseln`,
      );

      toggle.title = modeLabel;

      toggle.innerHTML =
        activeMode === "dark"
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
    });
  },

  paintLogo() {
    const settings = getSettings();
    const name =
      String(settings.business_name || "").trim() ||
      DEFAULT_SETTINGS.business_name;

    const logoUrl = String(settings.logo_url || "").trim();

    $$(".business-logo").forEach((container) => {
      if (!logoUrl) {
        container.innerHTML = `
          <span class="default-logo" aria-hidden="true">🍢</span>
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

  paintCompactMode() {
    document.body.classList.toggle(
      "compact-mode",
      Boolean(getSettings().compact_mode),
    );
  },

  paintVatVisibility() {
    $("#sum-vat")?.closest(".sum-row")?.classList.toggle(
      "hidden",
      !Boolean(getSettings().show_vat),
    );
  },

  paintDefaultPayment() {
    const settings = getSettings();
    const cashButton = $("#pay-cash");
    const cardButton = $("#pay-card");

    if (!cashButton || !cardButton) {
      return;
    }

    const payment = settings.default_payment === "card" ? "card" : "cash";

    cashButton.classList.toggle("btn-primary", payment === "cash");
    cardButton.classList.toggle("btn-primary", payment === "card");
  },

  async afterLogin() {
    $("#user-name").textContent = State.user.name;

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
        !["admin", "service", "lager"].includes(State.user.role),
      );
    }

    try {
      const [products, discounts] = await Promise.all([
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
    $("#nav")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-view]");

      if (button) {
        this.go(button.dataset.view);
      }
    });

    $("#logout")?.addEventListener("click", () => this.logout());

    $("#duty-banner-btn")?.addEventListener("click", () => {
      Duty.clockIn();
    });
  },

  go(view) {
    State.view = view;

    $$("#nav button[data-view]").forEach((button) => {
      button.setAttribute(
        "aria-current",
        String(button.dataset.view === view),
      );
    });

    $$(".view").forEach((panel) => {
      panel.classList.toggle(
        "hidden",
        panel.dataset.viewPanel !== view,
      );
    });

    const pageTitles = {
      kasse: "Kasse",
      bestellungen: "Bestellungen",
      verwaltung: "Verwaltung",
    };

    $("#topbar-title").textContent =
      pageTitles[view] || "Masora Döner";

    if (view === "bestellungen") {
      Orders.load();
    }

    if (view === "verwaltung") {
      Admin.open();
    }
  },

  bindTheme() {
    this.systemThemeQuery = window.matchMedia(
      "(prefers-color-scheme: light)",
    );

    this.systemThemeHandler = () => {
      if (getSettings().theme_mode === "system") {
        this.applyThemeMode("system");
      }
    };

    if (typeof this.systemThemeQuery.addEventListener === "function") {
      this.systemThemeQuery.addEventListener(
        "change",
        this.systemThemeHandler,
      );
    }

    $$("[data-theme-toggle]").forEach((toggle) => {
      toggle.addEventListener("click", async () => {
        const current =
          document.documentElement.getAttribute("data-theme") === "light"
            ? "light"
            : "dark";

        const next = current === "dark" ? "light" : "dark";

        State.settings = {
          ...getSettings(),
          theme_mode: next,
        };

        this.applySettings();

        try {
          State.settings = await DB.updateSettings(State.settings);
          this.applySettings();
          toast(
            next === "dark"
              ? "Dunkles Design aktiviert"
              : "Helles Design aktiviert",
          );
        } catch (error) {
          fail(error);
        }
      });
    });
  },
};

/* ==========================================================================
   Discord-Quittung über Cloudflare Worker
   ========================================================================== */

const DISCORD_WORKER_URL =
  "https://masora-doener-kasse-worker.finnwoschech.workers.dev/receipt";

async function sendReceiptToDiscord(order) {
  if (!order) {
    throw new Error("Keine Bestellung zum Senden vorhanden.");
  }

  const items = Array.isArray(order.items)
    ? order.items
    : Array.isArray(order.products)
      ? order.products
      : State.cart;

  const response = await fetch(DISCORD_WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      orderId:
        order.id ||
        order.order_id ||
        order.number ||
        "Unbekannt",

      customerName:
        order.customerName ||
        order.customer_name ||
        order.customer ||
        "Gast",

      total:
        order.total ||
        order.total_amount ||
        order.amount ||
        order.grand_total ||
        0,

      currency: order.currency || "EUR",
      staffName: State.user?.name || "Unbekannt",
      items,
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.error ||
        `Discord-Quittung konnte nicht gesendet werden (${response.status}).`,
    );
  }

  return result;
}

/* ==========================================================================
   Globale Exporte
   ========================================================================== */

window.sendReceiptToDiscord = sendReceiptToDiscord;

window.App = App;
window.State = State;
window.Duty = Duty;
window.Login = Login;

window.ACCENT_PRESETS = ACCENT_PRESETS;
window.getSettings = getSettings;
window.getSessionMinutes = getSessionMinutes;
