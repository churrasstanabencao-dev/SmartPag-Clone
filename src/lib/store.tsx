import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreRow = {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  is_matriz: boolean;
  owner_id: string;
  phone: string | null;
  address: string | null;
  active: boolean;
  created_at: string;
};

const LS_KEY = "smartpag_store_id";

/** Módulo-global: permite que queries antigas leiam a loja ativa sem prop drilling. */
let activeStoreId: string | null = null;
export function currentStoreId(): string {
  return activeStoreId ?? "00000000-0000-0000-0000-000000000000";
}

type Ctx = {
  storeId: string | null;
  store: StoreRow | null;
  stores: StoreRow[];
  isMatriz: boolean;
  /** matriz da rede do usuário (se houver) */
  matriz: StoreRow | null;
  /** lojas da rede visíveis para consolidação */
  networkStores: StoreRow[];
  setStoreId: (id: string) => void;
  loading: boolean;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [storeId, setStoreIdState] = useState<string | null>(null);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .order("is_matriz", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
  });

  useEffect(() => {
    if (!stores.length) return;
    const saved = localStorage.getItem(LS_KEY);
    const valid = saved && stores.some((s) => s.id === saved) ? saved : stores[0]!.id;
    if (valid !== storeId) {
      activeStoreId = valid;
      setStoreIdState(valid);
    }
  }, [stores, storeId]);

  const setStoreId = useCallback(
    (id: string) => {
      activeStoreId = id;
      localStorage.setItem(LS_KEY, id);
      setStoreIdState(id);
      qc.clear();
    },
    [qc],
  );

  const value = useMemo<Ctx>(() => {
    const store = stores.find((s) => s.id === storeId) ?? null;
    const matriz = stores.find((s) => s.is_matriz) ?? null;
    const networkStores = matriz
      ? stores.filter((s) => s.id === matriz.id || s.parent_id === matriz.id)
      : stores;
    return {
      storeId,
      store,
      stores,
      isMatriz: !!store?.is_matriz,
      matriz,
      networkStores,
      setStoreId,
      loading: isLoading,
    };
  }, [stores, storeId, setStoreId, isLoading]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore precisa estar dentro de StoreProvider");
  return ctx;
}
