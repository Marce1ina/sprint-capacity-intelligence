/// <reference types="vitest/config" />
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { getViteConfig } from "astro/config";
import { serverEnvSchema } from "./src/lib/env-schema";

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
      schema: serverEnvSchema,
    },
  },
);
