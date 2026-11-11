import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MessageCircle, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { brl } from "@/lib/format";
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

type Form = {
  name: string;
  phone: string;
  email: string;
  document: string;
  address: string;
  address_number: string;
  complement: string;
  neighborhood: string;
  city: string;
  zip_code: string;
  reference_point: string;
  birthdate: string;
  notes: string;
  is_delivery: boolean;
  source: string;
};

const empty: Form = {
  name: "",
  phone: "",
  email: "",
  document: "",
  address: "",
  address_number: "",
  complement: "",
  neighborhood: "",
  city: "",
  zip_code: "",
  reference_point: "",
  birthdate: "",
  notes: "",
  is_delivery: true,
  source: "",
};

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

export function CrmClientesTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>({ ...empty });
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyDelivery, setOnlyDelivery] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("store_id", currentStoreId())
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["crm-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tabs")
        .select("id, customer_id, closed_at, tab_items(quantity, unit_price_cents)")
        .eq("store_id", currentStoreId())
        .not("customer_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  const stats = useMemo(() => {
    const map = new Map<string, { total: number; orders: number; last: string | null }>();
    for (const t of history) {
      if (!t.customer_id) continue;
      const total = (t.tab_items ?? []).reduce(
        (s, i) => s + Number(i.quantity) * Number(i.unit_price_cents),
        0,
      );
      const cur = map.get(t.customer_id) ?? { total: 0, orders: 0, last: null };
      cur.total += total;
      cur.orders += 1;
      if (t.closed_at && (!cur.last || t.closed_at > cur.last)) cur.last = t.closed_at;
      map.set(t.customer_id, cur);
    }
    return map;
  }, [history]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        document: form.document.trim() || null,
        address: form.address.trim() || null,
        address_number: form.address_number.trim() || null,
        complement: form.complement.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        city: form.city.trim() || null,
        zip_code: form.zip_code.trim() || null,
        reference_point: form.reference_point.trim() || null,
        birthdate: form.birthdate || null,
        notes: form.notes.trim() || null,
        is_delivery: form.is_delivery,
        source: form.source.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editing);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("customers")
          .insert({ ...payload, user_id: auth.user!.id, store_id: currentStoreId() });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setForm({ ...empty });
      setEditing(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Cliente salvo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const term = search.trim().toLowerCase();
  const list = customers
    .filter((c) => (onlyDelivery ? c.is_delivery : true))
    .filter((c) =>
      term
        ? [c.name, c.phone, c.neighborhood, c.address]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term))
        : true,
    );

  const deliveryCount = customers.filter((c) => c.is_delivery).length;
  const totalRevenue = Array.from(stats.values()).reduce((s, v) => s + v.total, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-surface p-4">
          <p className="text-xs text-muted-foreground">Clientes cadastrados</p>
          <p className="text-2xl font-bold">{customers.length}</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-xs text-muted-foreground">Clientes de delivery</p>
          <p className="text-2xl font-bold">{deliveryCount}</p>
        </div>
        <div className="card-surface p-4">
          <p className="text-xs text-muted-foreground">Consumo registrado</p>
          <p className="text-2xl font-bold">{brl(totalRevenue)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-64"
          placeholder="Buscar por nome, telefone ou bairro..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyDelivery} onCheckedChange={setOnlyDelivery} />
          Somente delivery
        </label>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditing(null);
              setForm({ ...empty });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Novo cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp / telefone</Label>
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
                <Label>CPF</Label>
                <Input
                  value={form.document}
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Aniversário</Label>
                <Input
                  type="date"
                  value={form.birthdate}
                  onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Endereço</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input
                  value={form.address_number}
                  onChange={(e) => setForm({ ...form, address_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input
                  value={form.complement}
                  onChange={(e) => setForm({ ...form, complement: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input
                  value={form.neighborhood}
                  onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input
                  value={form.zip_code}
                  onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Origem (Instagram, indicação...)</Label>
                <Input
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Ponto de referência</Label>
                <Input
                  value={form.reference_point}
                  onChange={(e) => setForm({ ...form, reference_point: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Observações (preferências, alergias, histórico)</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  maxLength={500}
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Switch
                  checked={form.is_delivery}
                  onCheckedChange={(v) => setForm({ ...form, is_delivery: v })}
                />
                Cliente de delivery
              </label>
              <Button
                className="sm:col-span-2"
                disabled={!form.name.trim() || save.isPending}
                onClick={() => save.mutate()}
              >
                Salvar cliente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="card-surface divide-y divide-border">
        {list.length === 0 && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhum cliente encontrado.
          </p>
        )}
        {list.map((c) => {
          const s = stats.get(c.id);
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Users className="size-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-semibold">
                  {c.name}
                  {c.is_delivery && (
                    <span className="ml-2 rounded-full bg-chart-2/12 px-2 py-0.5 text-[11px] font-semibold text-chart-2">
                      delivery
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[c.phone, [c.address, c.address_number].filter(Boolean).join(", "), c.neighborhood]
                    .filter(Boolean)
                    .join(" · ") || "Sem contato"}
                </p>
              </div>
              <div className="ml-auto text-right text-xs text-muted-foreground">
                <p className="text-sm font-semibold text-foreground">{brl(s?.total ?? 0)}</p>
                <p>{s?.orders ?? 0} pedido(s)</p>
              </div>
              {c.phone && (
                <a
                  href={`https://wa.me/55${onlyDigits(c.phone)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground transition-colors hover:text-chart-2"
                  aria-label="Abrir WhatsApp"
                >
                  <MessageCircle className="size-4" />
                </a>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(c.id);
                  setForm({
                    name: c.name ?? "",
                    phone: c.phone ?? "",
                    email: c.email ?? "",
                    document: c.document ?? "",
                    address: c.address ?? "",
                    address_number: c.address_number ?? "",
                    complement: c.complement ?? "",
                    neighborhood: c.neighborhood ?? "",
                    city: c.city ?? "",
                    zip_code: c.zip_code ?? "",
                    reference_point: c.reference_point ?? "",
                    birthdate: c.birthdate ?? "",
                    notes: c.notes ?? "",
                    is_delivery: c.is_delivery,
                    source: c.source ?? "",
                  });
                  setOpen(true);
                }}
              >
                Editar
              </Button>
              <button
                onClick={() => remove.mutate(c.id)}
                className="text-muted-foreground transition-colors hover:text-destructive"
                aria-label="Excluir cliente"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
