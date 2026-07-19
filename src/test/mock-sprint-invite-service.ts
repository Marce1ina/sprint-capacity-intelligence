import { vi } from "vitest";

export const mockCreateOrGetInvite = vi.fn();
export const mockGetInviteByToken = vi.fn();
export const mockMarkConsumed = vi.fn();

/** Vitest requires a class or function constructor when code uses `new SprintInviteService`. */
export class MockSprintInviteService {
  createOrGetInvite = mockCreateOrGetInvite;
  getInviteByToken = mockGetInviteByToken;
  markConsumed = mockMarkConsumed;
}

export function sprintInviteServiceMockModule() {
  return {
    SprintInviteService: MockSprintInviteService,
  };
}
