import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { authRedirectUrl, establishAuthSession } from "@/lib/auth-callback";
import { authErrorMessage } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth/reset")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Redefinir senha — SmartPag" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"loading" | "request" | "update">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const get = (key: string) => search.get(key) || hash.get(key);
    const fromEmailLink = ["code", "token_hash", "access_token", "error", "error_description"].some(
      (key) => get(key),
    );
    const type = get("type");

    establishAuthSession().then((result) => {
      if (!active) return;
      if (result.error && fromEmailLink) {
        toast.error(result.error);
        setMode("request");
        return;
      }
      if (result.session && (type === "recovery" || result.type === "recovery" || fromEmailLink)) {
        setMode("update");
        return;
      }
      setMode("request");
    });

    return () => {
      active = false;
    };
  }, []);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl("/auth/reset"),
    });
    setLoading(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    toast.success("Enviamos um link para redefinir a senha. Veja a caixa de entrada e o spam.");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    toast.success("Senha atualizada.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-3">
          <span className="brand-gradient flex size-11 items-center justify-center rounded-2xl text-lg font-black text-primary-foreground">
            S
          </span>
          <span className="text-2xl font-black tracking-tight">SmartPag</span>
        </Link>

        <div className="card-surface p-6">
          {mode === "loading" ? (
            <p className="text-sm text-muted-foreground">Conferindo o link…</p>
          ) : mode === "update" ? (
            <form onSubmit={savePassword} className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold">Nova senha</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha uma senha para entrar com e-mail.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                Salvar senha
              </Button>
            </form>
          ) : (
            <form onSubmit={requestLink} className="space-y-4">
              <div>
                <h1 className="text-lg font-semibold">Esqueci minha senha</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enviaremos um link para criar uma nova senha.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-email">E-mail</Label>
                <Input
                  id="reset-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@restaurante.com"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                Enviar link
              </Button>
            </form>
          )}

          <Link to="/auth" className="mt-4 inline-block text-sm text-primary hover:underline">
            Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  );
}
