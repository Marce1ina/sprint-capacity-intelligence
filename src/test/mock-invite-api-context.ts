import { vi } from "vitest";

export const mockResolveInviteAdminService = vi.fn();

export function inviteApiContextMockModule() {
  return {
    resolveInviteAdminService: mockResolveInviteAdminService,
  };
}
