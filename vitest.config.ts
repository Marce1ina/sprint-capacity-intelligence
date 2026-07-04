/// <reference types="vitest/config" />
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { envField, getViteConfig } from "astro/config";

export default getViteConfig(
  {
    plugins: [tailwindcss()],
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  },
  {
    configFile: false,
    output: "server",
    integrations: [react()],
    env: {
      schema: {
        SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
        SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
        TOKEN_ENCRYPTION_KEY: envField.string({ context: "server", access: "secret", optional: true }),
        SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      },
    },
  },
);
