import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const empty = {
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  document: "",
  address: "",
  notes: "",
};

export function FornecedoresTab({ storeId }: { storeId?: string } = {}) {
  const qc = useQueryClient();
  const selectedStoreId = storeId ?? currentStoreId();
  const [form, setForm] = useState({ ...empty });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", selectedStoreId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("store_id", selectedStoreId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("suppliers").insert({
        user_id: auth.user!.id,
        store_id: selectedStoreId,
        name: form.name.trim(),
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        document: form.document.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm({ ...empty });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Fornecedor cadastrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("suppliers").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const term = search.trim().toLowerCase();
  const list = term
    ? suppliers.filter((s) =>
        [s.name, s.contact_name, s.phone, s.document]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : suppliers;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-64"
          placeholder="Buscar fornecedor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Novo fornecedor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo fornecedor</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Razão social / nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label>Contato</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>CNPJ / CPF</Label>
                <Input
                  value={form.document}
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Endereço</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Observações</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  maxLength={400}
                />
              </div>
              <Button
                className="sm:col-span-2"
                disabled={!form.name.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                Salvar fornecedor
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="card-surface divide-y divide-border">
        {list.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhum fornecedor cadastrado.
          </p>
        )}
        {list.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Truck className="size-4 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-semibold">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {[s.contact_name, s.phone, s.document].filter(Boolean).join(" · ") || "Sem contato"}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Switch
                checked={s.active}
                onCheckedChange={(v) => toggle.mutate({ id: s.id, active: v })}
              />
              <button
                onClick={() => remove.mutate(s.id)}
                className="text-muted-foreground transition-colors hover:text-destructive"
                aria-label="Excluir fornecedor"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
