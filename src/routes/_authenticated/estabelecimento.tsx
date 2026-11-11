import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionTitle } from "@/components/AppShell";
import { CardapioQR } from "@/features/cardapio-qr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/estabelecimento")({
  head: () => ({
    meta: [
      { title: "Estabelecimento — SmartPag" },
      {
        name: "description",
        content:
          "Configure os dados do seu estabelecimento: nome da loja, responsável, documento, telefone e chave PIX.",
      },
      { property: "og:title", content: "Estabelecimento — SmartPag" },
      {
        property: "og:description",
        content: "Dados da loja, responsável e chave PIX de recebimento.",
      },
    ],
  }),
  component: Estabelecimento,
});

function Estabelecimento() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    store_name: "",
    full_name: "",
    document: "",
    phone: "",
    pix_key: "",
  });

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      setForm({
        store_name: profile.store_name ?? "",
        full_name: profile.full_name ?? "",
        document: profile.document ?? "",
        phone: profile.phone ?? "",
        pix_key: profile.pix_key ?? "",
      });
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("profiles")
        .update({
          store_name: form.store_name.trim() || "Minha Loja",
          full_name: form.full_name.trim(),
          document: form.document.trim() || null,
          phone: form.phone.trim() || null,
          pix_key: form.pix_key.trim() || null,
        })
        .eq("id", auth.user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Dados salvos");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (key: keyof typeof form, label: string, max = 80) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={form[key]}
        maxLength={max}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <SectionTitle icon={Store} tone="bg-chart-1/12 text-chart-1">
        Estabelecimento
      </SectionTitle>

      <div className="card-surface max-w-xl space-y-4 p-6">
        {field("store_name", "Nome do estabelecimento")}
        {field("full_name", "Responsável")}
        {field("document", "CPF/CNPJ", 20)}
        {field("phone", "Telefone", 20)}
        {field("pix_key", "Chave PIX", 120)}
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          Salvar alterações
        </Button>
      </div>

      <CardapioQR />
    </div>
  );
}
