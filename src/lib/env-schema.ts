import { envField } from "astro/config";

export const serverEnvSchema = {
  SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
  SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
  TOKEN_ENCRYPTION_KEY: envField.string({ context: "server", access: "secret", optional: true }),
  SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
};
