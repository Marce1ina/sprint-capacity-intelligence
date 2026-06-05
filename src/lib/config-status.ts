import { SUPABASE_URL, SUPABASE_KEY, TOKEN_ENCRYPTION_KEY } from "astro:env/server";

export interface ConfigStatus {
  name: string;
  configured: boolean;
  message: string;
  docsUrl?: string;
  docsLabel?: string;
}

const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const configStatuses: ConfigStatus[] = [
  {
    name: "Supabase",
    configured: supabaseConfigured,
    message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
    docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
    docsLabel: "Zobacz instrukcję konfiguracji",
  },
  {
    name: "Token encryption",
    configured: !supabaseConfigured || Boolean(TOKEN_ENCRYPTION_KEY),
    message: "TOKEN_ENCRYPTION_KEY nie jest skonfigurowany — zapisywanie tokenów integracji jest wyłączone.",
    docsUrl: "https://github.com/przeprogramowani/10x-astro-starter#supabase-configuration",
    docsLabel: "Zobacz instrukcję konfiguracji",
  },
];

export const missingConfigs = configStatuses.filter((s) => !s.configured);
