import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";

/** Módulos que podem ser liberados por usuário. */
export const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "pdv", label: "PDV / Caixa" },
  { key: "garcom", label: "Garçom" },
  { key: "cadastro", label: "Cadastro" },
  { key: "estoque", label: "Estoque e Compras" },
  { key: "fornecedores-pedidos", label: "Fornecedores e Pedidos" },
  { key: "cardapio", label: "Menu Digital" },
  { key: "financeiro", label: "Financeiro" },
  { key: "contas_pagar", label: "Contas a Pagar" },
  { key: "contas_receber", label: "Contas a Receber" },
  { key: "funcionarios", label: "Funcionários" },
  { key: "lojas", label: "Rede (multi-loja)" },
  { key: "bi", label: "BI da Rede" },
  { key: "bi_loja", label: "BI por Loja" },
  { key: "estabelecimento", label: "Estabelecimento" },
  { key: "agentes", label: "Agentes IA" },
  { key: "usuarios", label: "Usuários e permissões" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export function usePermissions() {
  const { storeId, store } = useStore();

  const { data, isLoading } = useQuery({
    queryKey: ["my-modules", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_modules", { _store: storeId! });
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });

  const modules = data ?? [];
  const isOwner = modules.includes("*");
  const can = (key: string) => isOwner || modules.includes(key);

  return { modules, isOwner, can, loading: isLoading || !storeId, storeName: store?.name };
}
