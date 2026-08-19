/* ==========================================================================
   App-Kern: State, Hilfsfunktionen, Login, Navigation
   ========================================================================== */
'use strict';

const State = {
  user: null,
  products: [],
  discounts: [],
  staff: [],
  settings: null,
  cart: [],
  discountId: '',
  category: null,
  view: 'kasse',
};

/* ---------- Hilfsfunktionen ---------- */

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const money = (n) => euro.format(Number(n) || 0);
const num = (n) => Math.round((Number(n) || 0) * 100) / 100;

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}
function $(sel, root = document) {
  return root.querySelector(sel);
}
function $$(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function toast(message, kind = '') {
  const wrap = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function fail(err) {
  console.error(err);
  toast(err && err.message ? err.message : 'Ein Fehler ist aufgetreten', 'error');
}

/* ---------- Modal ---------- */

let modalKeyHandler = null;

function openModal({ title, bodyHTML, footHTML = '', onMount = null, wide = false }) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"
         ${wide ? 'style="max-width:720px"' : ''}>
      <div class="modal-head">
        <h2 class="modal-title">${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Schließen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      ${footHTML ? `<div class="modal-foot">${footHTML}</div>` : ''}
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) closeModal();
  });
  modalKeyHandler = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', modalKeyHandler);

  if (onMount) onMount(overlay);
  return overlay;
}

function closeModal() {
  const el = $('#modal-overlay');
  if (el) el.remove();
  if (modalKeyHandler) {
    document.removeEventListener('keydown', modalKeyHandler);
    modalKeyHandler = null;
  }
}

/* ---------- Bestätigung ---------- */

function confirmDialog(title, text, confirmLabel = 'Bestätigen') {
  return new Promise((resolve) => {
    openModal({
      title,
      bodyHTML: `<p style="font-size:var(--text-sm)">${esc(text)}</p>`,
      footHTML: `
        <button class="btn" data-close>Abbrechen</button>
        <button class="btn btn-primary" data-yes>${esc(confirmLabel)}</button>`,
      onMount(root) {
        $('[data-yes]', root).addEventListener('click', () => {
          closeModal();
          resolve(true);
        });
        root.addEventListener('click', (e) => {
          if (e.target === root || e.target.closest('[data-close]')) resolve(false);
        });
      },
    });
  });
}

/* ==========================================================================
   Login (PIN)
   ========================================================================== */

const Login = {
  pin: '',

  show() {
    $('#login').classList.remove('hidden');
    $('#app').classList.add('hidden');
    this.pin = '';
    this.paint();
  },

  hide() {
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
  },

  paint() {
    $$('#pin-display .pin-dot').forEach((d, i) => {
      d.classList.toggle('filled', i < this.pin.length);
    });
  },

  press(key) {
    const errEl = $('#login-error');
    errEl.textContent = '';
    if (key === 'del') {
      this.pin = this.pin.slice(0, -1);
    } else if (key === 'clear') {
      this.pin = '';
    } else if (this.pin.length < 4) {
      this.pin += key;
    }
    this.paint();
    if (this.pin.length === 4) setTimeout(() => this.submit(), 120);
  },

  async submit() {
    const errEl = $('#login-error');
    const match = State.staff.find((s) => s.pin === this.pin && s.is_active);
    if (!match) {
      errEl.textContent = 'PIN nicht erkannt';
      this.pin = '';
      this.paint();
      return;
    }
    State.user = match;
    this.hide();
    await App.afterLogin();
  },

  bind() {
    $('#pin-pad').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-key]');
      if (b) this.press(b.dataset.key);
    });
    document.addEventListener('keydown', (e) => {
      if ($('#login').classList.contains('hidden')) return;
      if (/^[0-9]$/.test(e.key)) this.press(e.key);
      else if (e.key === 'Backspace') this.press('del');
    });
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

    try {
      const [staff, settings] = await Promise.all([DB.listStaff(true), DB.getSettings()]);
      State.staff = staff;
      State.settings = settings;
      this.paintBrand();
      Login.show();
      const hint = $('#login-hint');
      if (!staff.length) {
        hint.textContent = 'Kein Personal angelegt. Bitte in der Datenbank einen PIN hinterlegen.';
      }
    } catch (err) {
      fail(err);
      $('#login-error').textContent = 'Keine Verbindung zur Datenbank';
    }
  },

  paintBrand() {
    const name = State.settings?.shop_name || 'Masora Döner';
    $$('.brand-name').forEach((el) => (el.textContent = name));
    document.title = name + ' — Kasse';
  },

  async afterLogin() {
    $('#user-name').textContent = State.user.name;
    $('#user-role').textContent = State.user.role === 'admin' ? 'Admin' : 'Kasse';
    $('#nav-admin').classList.toggle('hidden', State.user.role !== 'admin');
    try {
      const [products, discounts] = await Promise.all([
        DB.listProducts(true),
        DB.listDiscounts(true),
      ]);
      State.products = products;
      State.discounts = discounts;
      Kasse.render();
      this.go('kasse');
    } catch (err) {
      fail(err);
    }
  },

  logout() {
    State.user = null;
    State.cart = [];
    State.discountId = '';
    closeModal();
    Login.show();
  },

  bindNav() {
    $('#nav').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-view]');
      if (b) this.go(b.dataset.view);
    });
    $('#logout').addEventListener('click', () => this.logout());
  },

  go(view) {
    State.view = view;
    $$('#nav button[data-view]').forEach((b) => {
      b.setAttribute('aria-current', String(b.dataset.view === view));
    });
    $$('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.viewPanel !== view));
    if (view === 'bestellungen') Orders.load();
    if (view === 'verwaltung') Admin.open();
  },

  bindTheme() {
    const root = document.documentElement;
    let mode = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const paint = () => {
      root.setAttribute('data-theme', mode);
      $$('[data-theme-toggle]').forEach((t) => {
        t.setAttribute(
          'aria-label',
          mode === 'dark' ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln'
        );
        t.innerHTML =
          mode === 'dark'
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>';
      });
    };
    paint();
    $$('[data-theme-toggle]').forEach((t) =>
      t.addEventListener('click', () => {
        mode = mode === 'dark' ? 'light' : 'dark';
        paint();
      })
    );
  },
};

window.App = App;
window.State = State;
