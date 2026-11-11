import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  Plus,
  Trash2,
  Copy,
  Check,
  Phone,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  listWhatsAppContacts,
  addWhatsAppContact,
  removeWhatsAppContact,
  getWhatsAppConfig,
} from "@/lib/whatsapp.functions";
import { useStore } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PREVIEW_URL = "https://id-preview--77d45d92-165e-4418-a9e8-a3a4d18c7bc2.lovable.app";
const PUBLISHED_URL = "https://smart-pay-joy.lovable.app";

export function WhatsAppConfig() {
  const { storeId } = useStore();
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);

  const fetchConfig = useServerFn(getWhatsAppConfig);
  const fetchContacts = useServerFn(listWhatsAppContacts);
  const addContact = useServerFn(addWhatsAppContact);
  const removeContact = useServerFn(removeWhatsAppContact);

  const { data: config } = useQuery({
    queryKey: ["whatsapp-config"],
    queryFn: () => fetchConfig(),
  });

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["whatsapp-contacts", storeId],
    queryFn: () => fetchContacts({ data: { storeId: storeId! } }),
    enabled: !!storeId,
  });

  const webhookUrl = `${PUBLISHED_URL}/api/public/whatsapp`;
  const previewWebhookUrl = `${PREVIEW_URL}/api/public/whatsapp`;

  const waMeLink = config?.from
    ? `https://wa.me/${config.from.replace("whatsapp:", "")}?text=${encodeURIComponent("Olá! Quero consultar o SmartPag")}`
    : null;

  async function handleAdd() {
    if (!storeId || !phone.trim() || !name.trim()) return;
    setAdding(true);
    try {
      await addContact({
        data: {
          storeId,
          phone: phone.trim(),
          name: name.trim(),
          role: "manager" as const,
        },
      });
      toast.success("Número autorizado!");
      setPhone("");
      setName("");
      qc.invalidateQueries({ queryKey: ["whatsapp-contacts", storeId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      await removeContact({ data: { contactId: id } });
      toast.success("Número removido");
      qc.invalidateQueries({ queryKey: ["whatsapp-contacts", storeId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("URL copiada!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Status + Webhook URL */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <MessageCircle className="size-5 text-emerald-600" />
          <h3 className="text-sm font-semibold">WhatsApp — Integração Twilio</h3>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
              config?.configured
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700",
            )}
          >
            {config?.configured ? "Ativo" : "Pendente"}
          </span>
        </div>

        {config?.configured ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <Phone className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{config.from}</span>
              {waMeLink && (
                <a
                  href={waMeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto"
                >
                  <Button size="sm" variant="outline">
                    <MessageCircle className="mr-1.5 size-3.5" />
                    Falar no WhatsApp
                    <ExternalLink className="ml-1.5 size-3" />
                  </Button>
                </a>
              )}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Webhook URL (cole no Twilio → Messaging → Webhooks → "A message comes in"):
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                  {webhookUrl}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyUrl(webhookUrl)}
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Configure as variáveis <code>TWILIO_ACCOUNT_SID</code>,{" "}
            <code>TWILIO_AUTH_TOKEN</code> e <code>TWILIO_WHATSAPP_FROM</code> para
            ativar a integração.
          </p>
        )}
      </Card>

      {/* Authorized phones */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Números autorizados</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Apenas estes números podem conversar com os agentes pelo WhatsApp.
          Use o formato E.164 (ex: +5511999999999).
        </p>

        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[140px]">
            <Input
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-2"
            />
            <Input
              placeholder="+5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={adding || !phone.trim() || !name.trim() || !storeId}
          >
            {adding ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 size-4" />
            )}
            Autorizar
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando...
          </div>
        ) : contacts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum número autorizado ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c: any) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Phone className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.phone}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={() => handleRemove(c.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
