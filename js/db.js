/* ==========================================================================
   Supabase-Anbindung + Datenzugriff
   ========================================================================== */
'use strict';

const SUPABASE_URL = 'https://ldeuoyzuhgpvhznnfxyo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yTChUB8i4akcasmwhq4D6w_iBNzibQ8';

if (typeof window.supabase === 'undefined') {
  throw new Error('Supabase-Bibliothek wurde nicht geladen.');
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

/** Wirft bei Fehler, gibt sonst die Daten zurück. */
function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Datenbankfehler');
  return data;
}

const DB = {
  /* ---------- Produkte ---------- */
  async listProducts(onlyActive = false) {
    let q = sb
      .from('products')
      .select('*')
      .order('category_order')
      .order('category')
      .order('sort_order')
      .order('name');
    if (onlyActive) q = q.eq('is_active', true);
    return unwrap(await q);
  },
  async createProduct(p) {
    return unwrap(await sb.from('products').insert(p).select().single());
  },
  async updateProduct(id, patch) {
    return unwrap(await sb.from('products').update(patch).eq('id', id).select().single());
  },
  async deleteProduct(id) {
    return unwrap(await sb.from('products').delete().eq('id', id));
  },

  /* ---------- Rabatte ---------- */
  async listDiscounts(onlyActive = false) {
    let q = sb.from('discounts').select('*').order('name');
    if (onlyActive) q = q.eq('is_active', true);
    return unwrap(await q);
  },
  async createDiscount(d) {
    return unwrap(await sb.from('discounts').insert(d).select().single());
  },
  async updateDiscount(id, patch) {
    return unwrap(await sb.from('discounts').update(patch).eq('id', id).select().single());
  },
  async deleteDiscount(id) {
    return unwrap(await sb.from('discounts').delete().eq('id', id));
  },

  /* ---------- Personal ---------- */
  async listStaff(onlyActive = false) {
    let q = sb.from('staff').select('*').order('name');
    if (onlyActive) q = q.eq('is_active', true);
    return unwrap(await q);
  },
  async createStaff(s) {
    return unwrap(await sb.from('staff').insert(s).select().single());
  },
  async updateStaff(id, patch) {
    return unwrap(await sb.from('staff').update(patch).eq('id', id).select().single());
  },
  async deleteStaff(id) {
    return unwrap(await sb.from('staff').delete().eq('id', id));
  },

  /* ---------- Bestellungen ---------- */
  async createOrder(o) {
    return unwrap(await sb.from('orders').insert(o).select().single());
  },
  async listOrders({ from = null, to = null, limit = 300 } = {}) {
    let q = sb.from('orders').select('*').order('created_at', { ascending: false }).limit(limit);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lt('created_at', to);
    return unwrap(await q);
  },
  async cancelOrder(id) {
    return unwrap(
      await sb.from('orders').update({ status: 'storniert' }).eq('id', id).select().single()
    );
  },

  /* ---------- Einstellungen ---------- */
  async getSettings() {
    const rows = unwrap(await sb.from('settings').select('*').eq('id', 1));
    if (rows && rows.length) return rows[0];
    return unwrap(await sb.from('settings').insert({ id: 1 }).select().single());
  },
  async saveSettings(patch) {
    return unwrap(
      await sb
        .from('settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', 1)
        .select()
        .single()
    );
  },
};

window.DB = DB;
