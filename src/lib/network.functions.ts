import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lista os acessos de uma loja com o e-mail de cada usuário. */
export const listStoreMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("has_store_access", {
      _store: data.storeId,
    });
    if (!allowed) throw new Error("Sem acesso a esta loja");

    const { data: members, error } = await context.supabase
      .from("store_members")
      .select("id, user_id, role, created_at, store_id")
      .eq("store_id", data.storeId);
    if (error) throw error;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: {
      id: string;
      user_id: string;
      role: string;
      email: string;
      created_at: string;
    }[] = [];
    for (const m of members ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
      result.push({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
        email: u?.user?.email ?? "—",
      });
    }
    return result;
  });

/** Concede acesso a uma loja para um e-mail; cria o usuário se ainda não existir. */
export const addStoreMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        storeId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(["owner", "manager", "staff"]),
        password: z.string().min(6).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: canManage } = await context.supabase.rpc("can_manage_store", {
      _store: data.storeId,
    });
    if (!canManage) throw new Error("Somente gerentes da matriz podem conceder acesso");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    const { data: list } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    let user = list?.users?.find((u) => u.email?.toLowerCase() === email) ?? null;

    if (!user) {
      const { data: created, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password: data.password ?? crypto.randomUUID().slice(0, 12) + "Aa1!",
          email_confirm: true,
        });
      if (createErr) throw createErr;
      user = created.user;
    }
    if (!user) throw new Error("Não foi possível criar o usuário");

    const { error: memberErr } = await supabaseAdmin
      .from("store_members")
      .upsert(
        { store_id: data.storeId, user_id: user.id, role: data.role },
        { onConflict: "store_id,user_id" },
      );
    if (memberErr) throw memberErr;

    return { ok: true, email, created: true };
  });

/** Remove um acesso da loja. */
export const removeStoreMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("store_members")
      .delete()
      .eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });
