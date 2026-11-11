import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Reconstruct the full URL Twilio used (respect proxy headers)
        const urlObj = new URL(request.url);
        const proto =
          request.headers.get("x-forwarded-proto") ||
          request.headers.get("x-forwarded-protocol") ||
          urlObj.protocol.replace(":", "");
        const host = request.headers.get("host") || urlObj.host;
        const fullUrl = `${proto}://${host}${urlObj.pathname}${urlObj.search}`;

        // Parse form-encoded body
        const formData = await request.formData();
        const params: Record<string, string> = {};
        for (const [key, value] of formData.entries()) {
          params[key] = String(value);
        }

        // Validate Twilio signature
        const signature = request.headers.get("x-twilio-signature");
        const { validateTwilioSignature, processIncomingMessage, sendWhatsApp } =
          await import("@/lib/whatsapp.server");

        let valid = false;
        try {
          valid = validateTwilioSignature(fullUrl, params, signature);
        } catch {
          return new Response("Twilio not configured", { status: 503 });
        }

        if (!valid) {
          return new Response("Invalid signature", { status: 403 });
        }

        // Extract message fields
        const from = params["From"] ?? "";
        const body = params["Body"] ?? "";
        const numMedia = parseInt(params["NumMedia"] ?? "0", 10);
        const mediaUrls: string[] = [];
        for (let i = 0; i < numMedia; i++) {
          const url = params[`MediaUrl${i}`];
          if (url) mediaUrls.push(url);
        }

        // Process the message and send reply
        try {
          const reply = await processIncomingMessage(from, body, mediaUrls);
          if (reply) {
            await sendWhatsApp(from, reply);
          }
        } catch (e) {
          console.error("[WhatsApp webhook] Error:", e);
          try {
            await sendWhatsApp(
              from,
              "❌ Erro interno. Tente novamente em instantes.",
            );
          } catch {
            /* already logged */
          }
        }

        // Return empty 204 — replies are sent via REST API
        return new Response(null, { status: 204 });
      },
    },
  },
});
