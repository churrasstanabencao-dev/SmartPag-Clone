import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MemberInput = {
  storeId: string;
  email: string;
  password?: string;
  fullName?: string;
  role: string;
  modules: string[];
  employeeId?: string | null;
};

async function assertOwner(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string,
        ) => { maybeSingle: () => Promise<{ data: { owner_id: string } | null }> };
      };
    };
  },
  userId: string,
  storeId: string,
) {
  const { data } = await supabase
    .from("stores")
    .select("owner_id")
    .eq("id", storeId)
    .maybeSingle();
  if (!data || data.owner_id !== userId) {
    throw new Error("Somente o dono da loja pode gerenciar acessos");
  }
}

/** Cria (ou vincula) um usuário com acesso restrito a módulos de uma loja. */
export const createStoreUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: MemberInput) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase as never, userId, data.storeId);

    const email = data.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("E-mail inválido");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetId: string | null = null;
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      ...(data.password && data.password.length >= 6 ? { password: data.password } : {}),
      email_confirm: true,
      user_metadata: { full_name: data.fullName ?? email },
    });
    if (created.data.user) {
      targetId = created.data.user.id;
    } else {
      // já existe: localiza pelo e-mail
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list.data.users.find((u) => u.email?.toLowerCase() === email);
      if (!found) throw new Error(created.error?.message ?? "Não foi possível criar o usuário");
      targetId = found.id;
    }

    const { error } = await supabaseAdmin.from("store_members").upsert(
      {
        store_id: data.storeId,
        user_id: targetId,
        role: data.role,
        modules: data.modules,
        full_name: data.fullName ?? email,
        email,
        active: true,
        created_by: userId,
        employee_id: data.employeeId ?? null,
      },
      { onConflict: "store_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, userId: targetId };
  });

export const listStoreUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase as never, userId, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("store_members")
      .select("id, user_id, role, modules, full_name, email, active, created_at, employee_id")
      .eq("store_id", data.storeId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateStoreUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      storeId: string;
      memberId: string;
      role?: string;
      modules?: string[];
      active?: boolean;
      password?: string;
      employeeId?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase as never, userId, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: {
      role?: string;
      modules?: string[];
      active?: boolean;
      employee_id?: string | null;
    } = {};
    if (data.role !== undefined) patch.role = data.role;
    if (data.modules !== undefined) patch.modules = data.modules;
    if (data.active !== undefined) patch.active = data.active;
    if (data.employeeId !== undefined) patch.employee_id = data.employeeId || null;

    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin
        .from("store_members")
        .update(patch)
        .eq("id", data.memberId)
        .eq("store_id", data.storeId);
      if (error) throw new Error(error.message);
    }

    if (data.password && data.password.length >= 6) {
      const { data: row } = await supabaseAdmin
        .from("store_members")
        .select("user_id")
        .eq("id", data.memberId)
        .maybeSingle();
      if (row?.user_id) {
        const res = await supabaseAdmin.auth.admin.updateUserById(row.user_id, {
          password: data.password,
        });
        if (res.error) throw new Error(res.error.message);
      }
    }
    return { ok: true };
  });

export const removeStoreUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { storeId: string; memberId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase as never, userId, data.storeId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("store_members")
      .delete()
      .eq("id", data.memberId)
      .eq("store_id", data.storeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
