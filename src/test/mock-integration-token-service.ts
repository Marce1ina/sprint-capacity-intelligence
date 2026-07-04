import { vi } from "vitest";

export const mockGetJiraPat = vi.fn();
export const mockUpsertJiraPat = vi.fn();
export const mockGetGoogleCalendarTokens = vi.fn();
export const mockDeleteAllTokens = vi.fn();

/** Vitest requires a class or function constructor when code uses `new IntegrationTokenService`. */
export class MockIntegrationTokenService {
  getJiraPat = mockGetJiraPat;
  upsertJiraPat = mockUpsertJiraPat;
  getGoogleCalendarTokens = mockGetGoogleCalendarTokens;
  deleteAllTokens = mockDeleteAllTokens;
}

export function integrationTokenServiceMockModule() {
  return {
    IntegrationTokenService: MockIntegrationTokenService,
  };
}
