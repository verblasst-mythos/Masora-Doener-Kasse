/*
  Cloudflare Worker für Masora Döner Kasse.

  Empfang:
  POST /receipt von deiner GitHub-Pages-Seite.

  Aktion:
  Sendet die Bestelldaten als Embed an Discord.

  Das Secret DISCORD_WEBHOOK_URL wird in Cloudflare unter
  Worker → Bindings gespeichert, nicht in GitHub.
*/

const ALLOWED_ORIGIN = "https://verblasst-mythos.github.io";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json; charset=UTF-8",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

export default {
  async fetch(request, env) {
    // CORS-Preflight vom Browser.
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);

    if (url.pathname !== "/receipt") {
      return json(
        {
          ok: false,
          error: "Route nicht gefunden. Nutze /receipt.",
        },
        404,
      );
    }

    if (request.method !== "POST") {
      return json(
        {
          ok: false,
          error: "Nur POST ist erlaubt.",
        },
        405,
      );
    }

    // Zusätzlicher Schutz: Nur deine GitHub-Pages-Seite darf senden.
    if (request.headers.get("Origin") !== ALLOWED_ORIGIN) {
      return json(
        {
          ok: false,
          error: "Diese Webseite darf den Worker nicht verwenden.",
        },
        403,
      );
    }

    // Das Cloudflare-Secret prüfen.
    if (!env.DISCORD_WEBHOOK_URL) {
      return json(
        {
          ok: false,
          error: "DISCORD_WEBHOOK_URL fehlt in Cloudflare.",
        },
        500,
      );
    }

    let order;

    try {
      order = await request.json();
    } catch {
      return json(
        {
          ok: false,
          error: "Ungültige Daten. JSON wird erwartet.",
        },
        400,
      );
    }

    const orderId = String(order.orderId || "Unbekannt").slice(0, 100);
    const customerName = String(order.customerName || "Gast").slice(0, 100);
    const staffName = String(order.staffName || "Unbekannt").slice(0, 100);
    const currency = String(order.currency || "EUR").slice(0, 10);
    const total = Number(order.total || 0);
    const items = Array.isArray(order.items) ? order.items : [];

    const itemsText =
      items.length > 0
        ? items
            .slice(0, 15)
            .map((item) => {
              const name = String(item.name || "Artikel").slice(0, 80);
              const quantity = Math.max(1, Number(item.quantity || 1));
              const price = Number(item.price || 0);

              return `• ${quantity}× ${name} — ${(quantity * price)
                .toFixed(2)
                .replace(".", ",")} ${currency}`;
            })
            .join("\n")
            .slice(0, 1024)
        : "Keine Artikel vorhanden";

    const discordPayload = {
      username: "Masora Kassen-Bot",
      content: "✅ Neue Bestellung erfolgreich abgeschlossen.",
      embeds: [
        {
          title: `Quittung #${orderId}`,
          color: 0x57f287,
          fields: [
            {
              name: "Kunde",
              value: customerName,
              inline: true,
            },
            {
              name: "Gesamtbetrag",
              value: `${total.toFixed(2).replace(".", ",")} ${currency}`,
              inline: true,
            },
            {
              name: "Kassiert von",
              value: staffName,
              inline: true,
            },
            {
              name: "Artikel",
              value: itemsText,
              inline: false,
            },
          ],
          footer: {
            text: "Masora Döner Kasse",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const discordResponse = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(discordPayload),
    });

    if (!discordResponse.ok) {
      const details = await discordResponse.text();

      console.error(
        "Discord-WebHook-Fehler:",
        discordResponse.status,
        details,
      );

      return json(
        {
          ok: false,
          error: "Discord hat die Quittung nicht angenommen.",
        },
        502,
      );
    }

    return json({
      ok: true,
      message: "Discord-Quittung wurde gesendet.",
    });
  },
};
