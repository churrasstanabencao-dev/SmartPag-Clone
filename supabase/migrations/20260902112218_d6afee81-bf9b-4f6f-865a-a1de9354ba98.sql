REVOKE EXECUTE ON FUNCTION public.send_purchase(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_purchase(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_purchase(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pay_purchase(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.send_purchase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_purchase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_purchase(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_purchase(uuid) TO authenticated;
