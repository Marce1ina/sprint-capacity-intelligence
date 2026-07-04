import type { APIContext } from "astro";
import type { AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";
import { vi } from "vitest";

export interface MockApiContextOptions {
  url?: string | URL;
  user?: User | null;
  method?: string;
  headers?: Record<string, string>;
}

function createMockCookies(): AstroCookies {
  const store = new Map<string, string>();

  return {
    get: (name: string) => store.get(name),
    has: (name: string) => store.has(name),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (name: string) => {
      store.delete(name);
    },
    headers: () => new Headers(),
    merge: () => {
      /* AstroCookies.merge noop for tests */
    },
  } as AstroCookies;
}

/** Minimal APIContext for importing route handlers and middleware in Vitest. */
export function createMockApiContext(options: MockApiContextOptions = {}): APIContext {
  const url = options.url instanceof URL ? options.url : new URL(options.url ?? "http://localhost/");
  const headers = new Headers(options.headers);
  const request = new Request(url.toString(), {
    method: options.method ?? "GET",
    headers,
  });

  const redirect = vi.fn((location: string) => {
    const target = location.startsWith("http") ? location : new URL(location, url.origin).toString();
    return Response.redirect(target, 302);
  });

  return {
    url,
    request,
    cookies: createMockCookies(),
    locals: { user: options.user ?? null },
    redirect,
    clientAddress: "127.0.0.1",
    generator: "vitest",
    params: {},
    props: {},
    routePattern: url.pathname,
    site: new URL("http://localhost"),
    currentLocale: undefined,
    preferredLocale: undefined,
    preferredLocaleList: undefined,
    rewrite: vi.fn(),
    isPrerendered: false,
  } as APIContext;
}

/** Mock user fixture with overridable fields for auth-gated route tests. */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-test-id",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } satisfies User;
}
