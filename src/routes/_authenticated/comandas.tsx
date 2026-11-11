import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/comandas")({
  beforeLoad: () => {
    throw redirect({ to: "/pdv" });
  },
});
