import { TEST_ENCRYPTION_KEY } from "@/test/fixtures";

/** Shared astro:env/server values for lib and route tests. */
export const mockAstroEnvServer = {
  TOKEN_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_KEY: "test-anon-key",
} as const;

export const mockAstroEnvServerWithServiceRole = {
  ...mockAstroEnvServer,
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
} as const;
