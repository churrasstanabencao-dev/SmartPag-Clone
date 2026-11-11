import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { establishAuthSession } from "@/lib/auth-callback";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Concluindo acesso — SmartPag" }],
  }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    establishAuthSession().then((result) => {
      if (!active) return;
      if (result.error || !result.session) {
        toast.error(result.error ?? "Não foi possível concluir o acesso.");
        navigate({ to: "/auth", replace: true });
        return;
      }
      if (result.type === "recovery") {
        navigate({ to: "/auth/reset", replace: true });
        return;
      }
      navigate({ to: "/dashboard", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card-surface w-full max-w-md p-6 text-center">
        <p className="text-sm text-muted-foreground">Concluindo o acesso…</p>
        <Link to="/auth" className="mt-4 inline-block text-sm text-primary hover:underline">
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
