import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MontagemProduto({
  product,
  onOpenChange,
}: {
  product: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [comp, setComp] = useState<string>("");
  const [qty, setQty] = useState("1");

  const { data: products = [] } = useQuery({
    queryKey: ["products", "montagem"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, stock_qty, track_stock")
        .eq("store_id", currentStoreId())
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: components = [] } = useQuery({
    enabled: !!product,
    queryKey: ["product_components", product?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_components")
        .select("id, component_product_id, quantity")
        .eq("parent_product_id", product!.id);
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const q = Number(qty.replace(",", "."));
      if (!comp) throw new Error("Escolha o produto componente");
      if (!q || q <= 0) throw new Error("Quantidade inválida");
      if (comp === product!.id)
        throw new Error("Um produto não pode compor a si mesmo");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("product_components").upsert(
        {
          user_id: auth.user!.id,
          store_id: currentStoreId(),
          parent_product_id: product!.id,
          component_product_id: comp,
          quantity: q,
        },
        { onConflict: "parent_product_id,component_product_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setComp("");
      setQty("1");
      qc.invalidateQueries({ queryKey: ["product_components"] });
      toast.success("Componente adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_components")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product_components"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Montagem · {product?.name}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Ao vender este produto, o sistema dá baixa automática das quantidades
          abaixo no estoque. Ex.: balde de cerveja = 5 UN da cerveja.
        </p>

        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label>Produto componente</Label>
            <Select value={comp} onValueChange={setComp}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {products
                  .filter((p) => p.id !== product?.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.unit ?? "UN"})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-24 space-y-2">
            <Label>Qtd.</Label>
            <Input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            Adicionar
          </Button>
        </div>

        <div className="divide-y divide-border rounded-xl border border-border">
          {components.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhum componente. Produto vendido como item simples.
            </p>
          )}
          {components.map((c) => {
            const p = products.find((x) => x.id === c.component_product_id);
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2">
                <span className="font-semibold">{p?.name ?? "Produto"}</span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {Number(c.quantity)} {p?.unit ?? "UN"}
                </span>
                <button
                  onClick={() => remove.mutate(c.id)}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Remover componente"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
