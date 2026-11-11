import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import { QrCode, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentStoreId } from "@/lib/store";
import { IconTile } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export function CardapioQR() {
  const qc = useQueryClient();
  const [slug, setSlug] = useState("");
  const [mesa, setMesa] = useState("");
  const [origin, setOrigin] = useState("");
  const [qtdMesas, setQtdMesas] = useState(10);

  useEffect(() => setOrigin(window.location.origin), []);

  const { data: store } = useQuery({
    queryKey: ["store_menu_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, menu_public, menu_slug")
        .eq("id", currentStoreId())
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (store) setSlug(store.menu_slug ?? slugify(store.name));
  }, [store]);

  const save = useMutation({
    mutationFn: async (patch: { menu_public?: boolean; menu_slug?: string }) => {
      const { error } = await supabase.from("stores").update(patch).eq("id", currentStoreId());
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store_menu_config"] });
      toast.success("Cardápio atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const link = store?.menu_slug
    ? `${origin}/cardapio/${store.menu_slug}${mesa ? `?mesa=${encodeURIComponent(mesa)}` : ""}`
    : "";

  const download = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#cardapio-qr canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-cardapio${mesa ? `-mesa-${mesa}` : ""}.png`;
    a.click();
  };

  const mesaLink = (n: number) =>
    store?.menu_slug ? `${origin}/cardapio/${store.menu_slug}?mesa=${n}` : "";

  const downloadMesa = (n: number) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`#qr-mesa-${n} canvas`);
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-mesa-${String(n).padStart(2, "0")}.png`;
    a.click();
  };

  const downloadAll = () => {
    for (let n = 1; n <= qtdMesas; n++) setTimeout(() => downloadMesa(n), n * 150);
  };


  return (
    <div className="card-surface max-w-xl space-y-5 p-6">
      <div className="flex items-center gap-3">
        <IconTile icon={QrCode} tone="bg-chart-5/12 text-chart-5" />
        <div>
          <h3 className="font-bold">Cardápio digital com QR Code</h3>
          <p className="text-xs text-muted-foreground">
            Publique o cardápio e gere o QR para colar nas mesas.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Cardápio publicado</p>
          <p className="text-xs text-muted-foreground">
            Somente nome da loja, categorias e produtos ativos ficam visíveis.
          </p>
        </div>
        <Switch
          checked={!!store?.menu_public}
          onCheckedChange={(v) =>
            save.mutate({ menu_public: v, menu_slug: store?.menu_slug ?? slugify(slug) })
          }
        />
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label>Endereço do cardápio</Label>
          <Input
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            placeholder="minha-loja"
          />
        </div>
        <Button
          variant="secondary"
          disabled={!slug || save.isPending}
          onClick={() => save.mutate({ menu_slug: slug })}
        >
          Salvar link
        </Button>
      </div>

      {store?.menu_slug && (
        <>
          <div className="flex items-end gap-3">
            <div className="w-32 space-y-2">
              <Label>Mesa (opcional)</Label>
              <Input value={mesa} onChange={(e) => setMesa(e.target.value)} placeholder="05" />
            </div>
            <Button variant="secondary" onClick={download}>
              Baixar QR
            </Button>
          </div>

          <div id="cardapio-qr" className="flex flex-col items-center gap-3 rounded-2xl border border-border p-5">
            <QRCodeCanvas value={link} size={180} includeMargin />
            <p className="break-all text-center text-xs text-muted-foreground">{link}</p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  toast.success("Link copiado");
                }}
              >
                <Copy className="mr-2 size-4" />
                Copiar link
              </Button>
              <a href={link} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">
                  <ExternalLink className="mr-2 size-4" />
                  Abrir
                </Button>
              </a>
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-border p-5">
            <div className="flex items-end gap-3">
              <div className="w-40 space-y-2">
                <Label>Gerar QR para mesas 1 a</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={qtdMesas}
                  onChange={(e) =>
                    setQtdMesas(Math.min(60, Math.max(1, Number(e.target.value) || 1)))
                  }
                />
              </div>
              <Button variant="secondary" onClick={downloadAll}>
                Baixar todos
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: qtdMesas }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  id={`qr-mesa-${n}`}
                  onClick={() => downloadMesa(n)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border p-3 transition hover:bg-muted/60"
                >
                  <QRCodeCanvas value={mesaLink(n)} size={110} includeMargin />
                  <span className="text-xs font-bold">Mesa {String(n).padStart(2, "0")}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Clique em um QR para baixar em PNG e imprimir para a mesa.
            </p>
          </div>

          {!store.menu_public && (
            <p className="text-xs text-destructive">
              O cardápio está despublicado — ative a chave acima para que o link funcione.
            </p>
          )}

        </>
      )}
    </div>
  );
}
