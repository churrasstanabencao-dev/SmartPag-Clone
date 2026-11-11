import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/auth-errors";

export type AuthCallbackResult = {
  error: string | null;
  type: string | null;
  session: boolean;
};

export function authRedirectUrl(path: "/auth/callback" | "/auth/reset"): string {
  return `${window.location.origin}${path}`;
}

function urlParams() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const get = (key: string) => search.get(key) || hash.get(key);
  return { get };
}

// Completes Supabase email links and OAuth returns. PKCE `code` is exchanged
// by the client when the session is read. `token_hash` works even when the
// link is opened in another browser.
export async function establishAuthSession(): Promise<AuthCallbackResult> {
  const { get } = urlParams();
  const type = get("type");
  const urlError = get("error_description") || get("error");
  if (urlError) return { error: urlError, type, session: false };

  const tokenHash = get("token_hash");
  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: (type || "email") as EmailOtpType,
    });
    if (error) return { error: authErrorMessage(error), type, session: false };
    return { error: null, type, session: Boolean(data.session) };
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) return { error: authErrorMessage(error), type, session: false };
  return { error: null, type, session: Boolean(data.session) };
}
