export const brl = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export const parseBRLToCents = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
};

export const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
