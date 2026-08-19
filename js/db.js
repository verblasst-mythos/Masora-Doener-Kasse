/* ==========================================================================
   Supabase-Anbindung + Datenzugriff
   ========================================================================== */
"use strict";

const SUPABASE_URL = "https://ldeuoyzuhgpvhznnfxyo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_yTChUB8i4akcasmwhq4D6w_iBNzibQ8";

if (typeof window.supabase === "undefined") {
  throw new Error("Supabase-Bibliothek wurde nicht geladen.");
}

const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: { persistSession: false },
  },
);

/** Wirft bei Fehler, gibt sonst die Daten zurück. */
function unwrap({ data, error }) {
  if (error) throw new Error(error.message || "Datenbankfehler");
  return data;
}

const DB = {
  /* ---------- Produkte ---------- */
  async listProducts(onlyActive = false) {
    let q = sb
      .from("products")
      .select("*")
      .order("category_order")
      .order("category")
      .order("sort_order")
      .order("name");
    if (onlyActive) q = q.eq("is_active", true);
    return unwrap(await q);
  },
  async createProduct(p) {
    return unwrap(await sb.from("products").insert(p).select().single());
  },
  async updateProduct(id, patch) {
    return unwrap(
      await sb.from("products").update(patch).eq("id", id).select().single(),
    );
  },
  async deleteProduct(id) {
    return unwrap(await sb.from("products").delete().eq("id", id));
  },

  /* ---------- Rabatte ---------- */
  async listDiscounts(onlyActive = false) {
    let q = sb.from("discounts").select("*").order("name");
    if (onlyActive) q = q.eq("is_active", true);
    return unwrap(await q);
  },
  async createDiscount(d) {
    return unwrap(await sb.from("discounts").insert(d).select().single());
  },
  async updateDiscount(id, patch) {
    return unwrap(
      await sb.from("discounts").update(patch).eq("id", id).select().single(),
    );
  },
  async deleteDiscount(id) {
    return unwrap(await sb.from("discounts").delete().eq("id", id));
  },

  /* ---------- Personal ---------- */
  async listStaff(onlyActive = false) {
    let q = sb.from("staff").select("*").order("name");
    if (onlyActive) q = q.eq("is_active", true);
    return unwrap(await q);
  },
  async createStaff(s) {
    return unwrap(await sb.from("staff").insert(s).select().single());
  },
  async updateStaff(id, patch) {
    return unwrap(
      await sb.from("staff").update(patch).eq("id", id).select().single(),
    );
  },
  async deleteStaff(id) {
    return unwrap(await sb.from("staff").delete().eq("id", id));
  },

  /* ---------- Kooperationen (Rabatt mit Codewort) ---------- */
  async listCoops(onlyActive = false) {
    let q = sb.from("cooperations").select("*").order("name");
    if (onlyActive) q = q.eq("is_active", true);
    return unwrap(await q);
  },
  async createCoop(c) {
    return unwrap(await sb.from("cooperations").insert(c).select().single());
  },
  async updateCoop(id, patch) {
    return unwrap(
      await sb
        .from("cooperations")
        .update(patch)
        .eq("id", id)
        .select()
        .single(),
    );
  },
  async deleteCoop(id) {
    return unwrap(await sb.from("cooperations").delete().eq("id", id));
  },
  /** Sucht eine aktive Kooperation zum eingegebenen Codewort. */
  async findCoopByCode(code) {
    const clean = String(code || "").trim();
    if (!clean) return null;
    const rows = unwrap(
      await sb
        .from("cooperations")
        .select("*")
        .eq("is_active", true)
        .ilike("code", clean),
    );
    return rows && rows.length ? rows[0] : null;
  },

  /* ---------- Bestellungen ---------- */
  /** Legt die Bestellung an und bucht in derselben Transaktion das Lager ab. */
  /** Ist die Datenbank-Erweiterung (Schichten, Lager, Kooperationen) schon eingespielt? */
  isMissingFunction(err) {
    const m = String(err?.message || err || "");
    return (
      err?.code === "PGRST202" ||
      m.includes("does not exist") ||
      m.includes("Could not find the function")
    );
  },

  async placeOrder(o) {
    const res = await sb.rpc("place_order", {
      p_items: o.items,
      p_subtotal: o.subtotal,
      p_discount_name: o.discount_name,
      p_discount_amount: o.discount_amount,
      p_discount_source: o.discount_source || "rabatt",
      p_total: o.total,
      p_payment_method: o.payment_method,
      p_cash_given: o.cash_given,
      p_change_due: o.change_due,
      p_staff_id: o.staff_id,
      p_staff_name: o.staff_name,
      p_shift_id: o.shift_id,
      p_note: o.note || null,
    });

    // Notfall-Weg: Lauft die Kasse noch auf dem alten Datenbankstand,
    // wird die Bestellung ohne Lagerabzug direkt gespeichert.
    if (res.error && this.isMissingFunction(res.error)) {
      console.warn(
        "place_order fehlt — Bestellung wird ohne Lagerabzug gespeichert",
      );
      return unwrap(
        await sb
          .from("orders")
          .insert({
            items: o.items,
            subtotal: o.subtotal,
            discount_name: o.discount_name,
            discount_amount: o.discount_amount,
            total: o.total,
            payment_method: o.payment_method,
            cash_given: o.cash_given,
            change_due: o.change_due,
            staff_name: o.staff_name,
            note: o.note || null,
          })
          .select()
          .single(),
      );
    }
    return unwrap(res);
  },
  async listOrders({ from = null, to = null, limit = 500 } = {}) {
    let q = sb
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    return unwrap(await q);
  },
  /** Storniert und bucht das Lager zurück. */
  async cancelOrder(id, staffName = null) {
    return unwrap(
      await sb.rpc("cancel_order", { p_order_id: id, p_staff_name: staffName }),
    );
  },

  /* ---------- Schichten (Ein- und Ausstempeln) ---------- */
  async clockIn(staffId, staffName) {
    return unwrap(
      await sb.rpc("clock_in", {
        p_staff_id: staffId,
        p_staff_name: staffName,
      }),
    );
  },
  async clockOut(shiftId, auto = false) {
    return unwrap(
      await sb.rpc("clock_out", { p_shift_id: shiftId, p_auto: auto }),
    );
  },
  async resumeShift(staffId) {
    return unwrap(await sb.rpc("resume_shift", { p_staff_id: staffId }));
  },
  async openShift(staffId) {
    const rows = unwrap(
      await sb
        .from("shifts")
        .select("*")
        .eq("staff_id", staffId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1),
    );
    return rows && rows.length ? rows[0] : null;
  },
  async listShifts({
    from = null,
    to = null,
    staffId = null,
    limit = 500,
  } = {}) {
    let q = sb
      .from("shifts")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (from) q = q.gte("started_at", from);
    if (to) q = q.lt("started_at", to);
    if (staffId) q = q.eq("staff_id", staffId);
    return unwrap(await q);
  },

  /* ---------- Lager ---------- */
  async adjustStock(productId, delta, reason, staffName) {
    return unwrap(
      await sb.rpc("adjust_stock", {
        p_product_id: productId,
        p_delta: delta,
        p_reason: reason,
        p_staff_name: staffName,
      }),
    );
  },
  async listStockMoves({ limit = 120, productId = null } = {}) {
    let q = sb
      .from("stock_moves")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (productId) q = q.eq("product_id", productId);
    return unwrap(await q);
  },

  /* ---------- Einstellungen ---------- */
  async getSettings() {
    const rows = unwrap(await sb.from("settings").select("*").eq("id", 1));
    if (rows && rows.length) return rows[0];
    return unwrap(
      await sb.from("settings").insert({ id: 1 }).select().single(),
    );
  },
  async saveSettings(patch) {
    return unwrap(
      await sb
        .from("settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select()
        .single(),
    );
  },
};

window.DB = DB;
