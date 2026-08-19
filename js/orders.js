/* ==========================================================================
   Bestellungen: Übersicht, Umsätze, Storno, Bon-Nachdruck
   ========================================================================== */
'use strict';

function startOfDay(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

const Orders = {
  range: 'today',
  rows: [],
  loading: false,

  rangeFilter() {
    if (this.range === 'today') return { from: startOfDay(0).toISOString() };
    if (this.range === 'week') return { from: startOfDay(-6).toISOString() };
    return {};
  },

  async load() {
    this.loading = true;
    this.paint();
    try {
      this.rows = await DB.listOrders(this.rangeFilter());
    } catch (err) {
      fail(err);
      this.rows = [];
    }
    this.loading = false;
    this.paint();
  },

  stats() {
    const valid = this.rows.filter((o) => o.status !== 'storniert');
    const sum = (arr) => num(arr.reduce((s, o) => s + Number(o.total), 0));
    const cash = valid.filter((o) => o.payment_method === 'bar');
    const card = valid.filter((o) => o.payment_method === 'karte');
    return {
      count: valid.length,
      revenue: sum(valid),
      avg: valid.length ? num(sum(valid) / valid.length) : 0,
      cash: sum(cash),
      card: sum(card),
      cancelled: this.rows.length - valid.length,
    };
  },

  paint() {
    const s = this.stats();
    $('#o-revenue').textContent = money(s.revenue);
    $('#o-count').textContent = s.count;
    $('#o-avg').textContent = money(s.avg);
    $('#o-cash').textContent = money(s.cash);
    $('#o-card').textContent = money(s.card);

    $$('#o-range button').forEach((b) =>
      b.setAttribute('aria-current', String(b.dataset.range === this.range))
    );

    const body = $('#o-tbody');
    if (this.loading) {
      body.innerHTML = `<tr><td colspan="7" class="muted" style="padding:var(--space-8);text-align:center">
        Lade Bestellungen …</td></tr>`;
      return;
    }
    if (!this.rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="muted" style="padding:var(--space-8);text-align:center">
        Für diesen Zeitraum gibt es keine Bestellungen.</td></tr>`;
      return;
    }

    body.innerHTML = this.rows
      .map((o) => {
        const pos = (o.items || []).reduce((n, i) => n + Number(i.qty), 0);
        const cancelled = o.status === 'storniert';
        return `<tr>
          <td class="strong">#${o.order_no}</td>
          <td class="muted">${fmtDateTime(o.created_at)}</td>
          <td>${pos} Artikel${o.staff_name ? ` · <span class="muted">${esc(o.staff_name)}</span>` : ''}</td>
          <td><span class="tag">${o.payment_method === 'bar' ? 'Bar' : 'Karte'}</span></td>
          <td class="num">${money(o.total)}</td>
          <td><span class="tag ${cancelled ? 'bad' : 'ok'}">${cancelled ? 'Storniert' : 'OK'}</span></td>
          <td>
            <div class="row" style="gap:var(--space-2);flex-wrap:nowrap">
              <button class="btn btn-sm" data-bon="${o.id}">Bon</button>
              ${cancelled || State.user?.role !== 'admin'
                ? ''
                : `<button class="btn btn-sm btn-danger" data-storno="${o.id}">Storno</button>`}
            </div>
          </td>
        </tr>`;
      })
      .join('');
  },

  bind() {
    $('#o-range').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-range]');
      if (!b) return;
      this.range = b.dataset.range;
      this.load();
    });

    $('#o-reload').addEventListener('click', () => this.load());

    $('#o-tbody').addEventListener('click', async (e) => {
      const bon = e.target.closest('button[data-bon]');
      const storno = e.target.closest('button[data-storno]');
      if (bon) {
        const o = this.rows.find((x) => x.id === bon.dataset.bon);
        if (o) Receipt.show(o);
        return;
      }
      if (storno) {
        const o = this.rows.find((x) => x.id === storno.dataset.storno);
        if (!o) return;
        if (State.user?.role !== 'admin') {
          toast('Stornieren ist nur für Admins möglich', 'error');
          return;
        }
        const ok = await confirmDialog(
          `Bestellung #${o.order_no} stornieren?`,
          `Der Betrag von ${money(o.total)} wird nicht mehr im Umsatz gezählt. Der Bon bleibt zur Nachvollziehbarkeit gespeichert.`,
          'Stornieren'
        );
        if (!ok) return;
        try {
          await DB.cancelOrder(o.id);
          toast(`Bestellung #${o.order_no} storniert`);
          this.load();
        } catch (err) {
          fail(err);
        }
      }
    });
  },
};

window.Orders = Orders;
