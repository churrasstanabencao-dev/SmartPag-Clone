export function authErrorMessage(
  error: { message?: string; code?: unknown } | null | undefined,
): string {
  const code = typeof error?.code === "string" ? error.code : "";
  const msg = typeof error?.message === "string" ? error.message : "";

  if (code === "email_not_confirmed" || /not confirmed/i.test(msg)) {
    return "Confirme seu e-mail antes de entrar. Abra o link que enviamos e confira o spam.";
  }
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) {
    return "E-mail ou senha incorretos. Se a conta foi criada com o Google, use Entrar com Google ou redefina a senha.";
  }
  if (code === "over_email_send_rate_limit" || /security purposes/i.test(msg)) {
    return "Aguarde cerca de um minuto antes de pedir outro e-mail.";
  }
  if (code === "user_already_exists" || /already registered/i.test(msg)) {
    return "Este e-mail já tem conta. Entre, use o Google ou redefina a senha.";
  }
  if (/missing oauth secret|unsupported provider/i.test(msg)) {
    return "O Google ainda não está configurado no Supabase: falta o segredo do cliente OAuth.";
  }
  if (/redirect/i.test(msg) && /url|not allowed/i.test(msg)) {
    return "Este endereço ainda não está na lista de redirecionamento do Supabase.";
  }
  return msg || "Não foi possível concluir o acesso.";
}
