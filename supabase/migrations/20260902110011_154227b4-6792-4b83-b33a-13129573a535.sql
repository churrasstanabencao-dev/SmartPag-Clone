REVOKE ALL ON FUNCTION public.confirm_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_transfer(uuid) TO authenticated;
