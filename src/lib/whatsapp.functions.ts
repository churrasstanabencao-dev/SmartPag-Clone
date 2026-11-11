import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============= List contacts =============

export const listWhatsAppContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_store_access", {
      _store: data.storeId,
    });
    if (!allowed) throw new Error("Sem acesso a esta loja");

    const { data: contacts, error } = await context.supabase
      .from("whatsapp_contacts")
      .select("id,phone,name,role,active,created_at,store_id")
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return contacts ?? [];
  });

// ============= Add contact =============

export const addWhatsAppContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        storeId: z.string().uuid(),
        phone: z
          .string()
          .regex(/^\+[0-9]{8,15}$/, "Use formato E.164: +5511999999999"),
        name: z.string().min(1).max(80),
        role: z.enum(["manager", "staff"]).default("manager"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: canManage } = await context.supabase.rpc("can_manage_store", {
      _store: data.storeId,
    });
    if (!canManage) throw new Error("Somente gerentes podem adicionar contatos");

    const { error } = await context.supabase
      .from("whatsapp_contacts")
      .insert({
        store_id: data.storeId,
        phone: data.phone,
        name: data.name,
        role: data.role,
        active: true,
      });

    if (error) {
      if (error.code === "23505") throw new Error("Número já cadastrado");
      throw error;
    }
    return { ok: true };
  });

// ============= Remove contact =============

export const removeWhatsAppContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ contactId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_contacts")
      .delete()
      .eq("id", data.contactId);
    if (error) throw error;
    return { ok: true };
  });

// ============= List messages =============

export const listWhatsAppMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_store_access", {
      _store: data.storeId,
    });
    if (!allowed) throw new Error("Sem acesso a esta loja");

    const { data: messages, error } = await context.supabase
      .from("whatsapp_messages")
      .select("id,phone,direction,body,media_url,status,created_at")
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return messages ?? [];
  });

// ============= Get config =============

export const getWhatsAppConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const from = process.env["TWILIO_WHATSAPP_FROM"] ?? null;
    const configured = Boolean(
      process.env["TWILIO_ACCOUNT_SID"] &&
        process.env["TWILIO_AUTH_TOKEN"] &&
        process.env["TWILIO_WHATSAPP_FROM"],
    );
    return { from, configured };
  });
