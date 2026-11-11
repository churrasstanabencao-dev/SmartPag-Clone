import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/caixa")({
  beforeLoad: () => {
    throw redirect({ to: "/pdv" });
  },
});
