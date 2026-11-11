import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Boxes, ClipboardList, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { TIPOS_PRODUTO, UNIDADES } from "@/lib/composicao";
import { IMAGE_ACCEPT, fileToResizedDataUrl } from "@/lib/image";
import { brl, parseBRLToCents } from "@/lib/format";
import { SectionTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FornecedoresTab } from "@/features/fornecedores";
import { CrmClientesTab } from "@/features/crm-clientes";
import { MontagemProduto } from "@/features/montagem-produto";

export const Route = createFileRoute("/_authenticated/cadastro")({
  head: () => ({
    meta: [
      { title: "Cadastro de produtos — SmartPag" },
      {
        name: "description",
        content:
          "Cadastre produtos, preços, categorias e clientes do seu estabelecimento no SmartPag.",
      },
      { property: "og:title", content: "Cadastro — SmartPag" },
      {
        property: "og:description",
        content: "Produtos, categorias e clientes em um só lugar.",
      },
    ],
  }),
  component: Cadastro,
});

function Cadastro() {
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*")
        .eq("store_id", currentStoreId()).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*")
        .eq("store_id", currentStoreId()).order("name");
      if (error) throw error;
      return data;
    },
  });

  const [pName, setPName] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pCat, setPCat] = useState<string>("none");
  const [pUnit, setPUnit] = useState<string>("UN");
  const [pType, setPType] = useState<string>("simples");
  const [pImage, setPImage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [montagem, setMontagem] = useState<{ id: string; name: string } | null>(null);
  const [catName, setCatName] = useState("");
  const [catParent, setCatParent] = useState<string>("none");

  function openNew() {
    setEditing(null);
    setPName("");
    setPPrice("");
    setPDesc("");
    setPCat("none");
    setPUnit("UN");
    setPType("simples");
    setPImage(null);
    setFormOpen(true);
  }

  function openEdit(p: (typeof products)[number]) {
    setEditing(p.id);
    setPName(p.name);
    setPPrice((Number(p.price_cents) / 100).toFixed(2).replace(".", ","));
    setPDesc(p.description ?? "");
    setPCat(p.category_id ?? "none");
    setPUnit(p.unit ?? "UN");
    setPType(p.product_type ?? "simples");
    setPImage(p.image_url ?? null);
    setFormOpen(true);
  }

  const saveProduct = useMutation({
    mutationFn: async () => {
      const payload = {
        name: pName.trim(),
        description: pDesc.trim() || null,
        price_cents: parseBRLToCents(pPrice),
        category_id: pCat === "none" ? null : pCat,
        unit: pUnit,
        product_type: pType,
        image_url: pImage,
      };
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing);
        if (error) throw error;
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("products").insert({
        user_id: auth.user!.id,
        store_id: currentStoreId(),
        ...payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(editing ? "Produto atualizado" : "Produto cadastrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const toggleProduct = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("products").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const createCategory = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("categories")
        .insert({
          user_id: auth.user!.id,
          store_id: currentStoreId(),
          name: catName.trim(),
          parent_id: catParent === "none" ? null : catParent,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setCatName("");
      setCatParent("none");
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Categoria criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setSector = useMutation({
    mutationFn: async ({ id, sector }: { id: string; sector: string }) => {
      const { error } = await supabase
        .from("categories")
        .update({ print_sector: sector })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const parentCategories = categories.filter((c) => !c.parent_id);

  return (
    <div className="space-y-6">
      <SectionTitle icon={ClipboardList} tone="bg-chart-1/12 text-chart-1">
        Cadastro
      </SectionTitle>

      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Produtos</TabsTrigger>
          <TabsTrigger value="categorias">Categorias</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          <TabsTrigger value="clientes">CRM / Clientes</TabsTrigger>
        </TabsList>


        <TabsContent value="produtos" className="mt-4 space-y-4">
          <Button size="sm" onClick={openNew}>
            <Plus className="size-4" /> Novo produto
          </Button>

          <Dialog open={formOpen} onOpenChange={setFormOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={pName} onChange={(e) => setPName(e.target.value)} maxLength={80} />
                </div>
                <div className="space-y-2">
                  <Label>Imagem do produto (JPG, PNG ou WEBP)</Label>
                  <div className="flex items-center gap-3">
                    {pImage ? (
                      <img
                        src={pImage}
                        alt={`Imagem de ${pName || "produto"}`}
                        className="size-16 rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                        <ImageIcon className="size-5" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Input
                        type="file"
                        accept={IMAGE_ACCEPT}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            setPImage(await fileToResizedDataUrl(f));
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                      />
                      {pImage && (
                        <button
                          type="button"
                          onClick={() => setPImage(null)}
                          className="text-xs font-semibold text-muted-foreground hover:text-destructive"
                        >
                          Remover imagem
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Preço (R$)</Label>
                  <Input
                    value={pPrice}
                    onChange={(e) => setPPrice(e.target.value)}
                    placeholder="0,00"
                    inputMode="numeric"
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor informado: {brl(parseBRLToCents(pPrice))}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={pCat} onValueChange={setPCat}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sem categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem categoria</SelectItem>
                      {parentCategories.flatMap((c) => [
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>,
                        ...categories
                          .filter((s) => s.parent_id === c.id)
                          .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {"\u00A0\u00A0↳ "}
                              {s.name}
                            </SelectItem>
                          )),
                      ])}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Unidade de medida</Label>
                    <Select value={pUnit} onValueChange={setPUnit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIDADES.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={pType} onValueChange={setPType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_PRODUTO.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {pType !== "simples" && (
                  <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Depois de salvar, use o botão <strong>Montagem</strong> na lista para
                    definir os itens que compõem o produto (ex.: balde com 5 latões).
                  </p>
                )}
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    value={pDesc}
                    onChange={(e) => setPDesc(e.target.value)}
                    maxLength={300}
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={!pName.trim() || saveProduct.isPending}
                  onClick={() => saveProduct.mutate()}
                >
                  Salvar
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className="card-surface divide-y divide-border">
            {products.length === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Nenhum produto cadastrado.
              </p>
            )}
            {products.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={`Imagem de ${p.name}`}
                    loading="lazy"
                    className="size-10 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                    <ImageIcon className="size-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {categories.find((c) => c.id === p.category_id)?.name ?? "Sem categoria"}
                    {" · "}
                    {p.unit ?? "UN"}
                    {p.product_type && p.product_type !== "simples"
                      ? ` · ${p.product_type}`
                      : ""}
                  </p>
                </div>
                <span className="ml-auto font-bold">{brl(Number(p.price_cents))}</span>
                <button
                  onClick={() => openEdit(p)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Pencil className="size-3.5" /> Editar
                </button>
                {p.product_type && p.product_type !== "simples" && (
                  <button
                    onClick={() => setMontagem({ id: p.id, name: p.name })}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Boxes className="size-3.5" /> Montagem
                  </button>
                )}
                <Switch
                  checked={p.active}
                  onCheckedChange={(v) => toggleProduct.mutate({ id: p.id, active: v })}
                />
                <button
                  onClick={() => deleteProduct.mutate(p.id)}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Excluir produto"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </TabsContent>


        <TabsContent value="categorias" className="mt-4 space-y-4">
          <div className="card-surface flex flex-wrap items-end gap-3 p-5">
            <div className="w-64 space-y-2">
              <Label>Nome da categoria</Label>
              <Input value={catName} onChange={(e) => setCatName(e.target.value)} />
            </div>
            <div className="w-64 space-y-2">
              <Label>Categoria mãe (opcional)</Label>
              <Select value={catParent} onValueChange={setCatParent}>
                <SelectTrigger>
                  <SelectValue placeholder="Categoria principal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Categoria principal</SelectItem>
                  {parentCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!catName.trim()} onClick={() => createCategory.mutate()}>
              Adicionar
            </Button>
          </div>
          <div className="card-surface divide-y divide-border">
            {categories.length === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma categoria criada.
              </p>
            )}
            {parentCategories.map((c) => (
              <div key={c.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{c.name}</span>
                  <select
                    aria-label="Setor de impressão"
                    value={c.print_sector ?? "cozinha"}
                    onChange={(e) =>
                      setSector.mutate({ id: c.id, sector: e.target.value })
                    }
                    className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="cozinha">Imprime na cozinha</option>
                    <option value="bar">Imprime no bar</option>
                    <option value="chapa">Imprime na chapa</option>
                    <option value="nenhum">Não imprime</option>
                  </select>
                  <button
                    onClick={() => deleteCategory.mutate(c.id)}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="Excluir categoria"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="mt-1 space-y-1">
                  {categories
                    .filter((s) => s.parent_id === c.id)
                    .map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-3 pl-4 text-sm text-muted-foreground"
                      >
                        <span>↳ {s.name}</span>
                        <button
                          onClick={() => deleteCategory.mutate(s.id)}
                          className="ml-auto transition-colors hover:text-destructive"
                          aria-label="Excluir subcategoria"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="fornecedores" className="mt-4">
          <FornecedoresTab />
        </TabsContent>

        <TabsContent value="clientes" className="mt-4">
          <CrmClientesTab />
        </TabsContent>
      </Tabs>

      <MontagemProduto
        product={montagem}
        onOpenChange={(v) => !v && setMontagem(null)}
      />
    </div>
  );
}
