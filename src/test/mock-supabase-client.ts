import { vi } from "vitest";

export const mockSupabaseCreateClient = vi.fn((): object => ({}));

export function supabaseClientMockModule() {
  return {
    createClient: (): object | null => mockSupabaseCreateClient(),
  };
}
