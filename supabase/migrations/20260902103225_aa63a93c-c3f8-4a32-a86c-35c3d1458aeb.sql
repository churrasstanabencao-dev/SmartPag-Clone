ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS tab_id uuid REFERENCES public.tabs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.stock_movements.tab_id IS 'Comanda/mesa que originou a movimentação (usado em baixas de venda).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
