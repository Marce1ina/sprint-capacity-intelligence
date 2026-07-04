import { describe, expect, it } from "vitest";
import { SECRET_PROBE } from "@/test/fixtures";
import { assertNoSecretProbe } from "@/test/secret-scan";
import { authErrorUserMessage } from "@/lib/auth-errors";

describe("authErrorUserMessage", () => {
  it("returns whitelisted messages for known OAuth error codes", () => {
    expect(authErrorUserMessage({ code: "access_denied" })).toBe("Google sign-in was cancelled.");
    expect(authErrorUserMessage({ code: "invalid_grant" })).toBe("Sign-in session expired. Please try again.");
  });

  it("never echoes raw error.message containing probe substrings", () => {
    const message = authErrorUserMessage({
      code: "unknown_code",
      message: `OAuth failed with token ${SECRET_PROBE}`,
    });

    expect(message).toBe("Could not sign in. Please try again.");
    assertNoSecretProbe({ message }, SECRET_PROBE);
  });

  it("maps expired message hints without leaking token material", () => {
    const message = authErrorUserMessage({ message: `Session expired for ${SECRET_PROBE}` });
    expect(message).toBe("Sign-in session expired. Please try again.");
    assertNoSecretProbe({ message }, SECRET_PROBE);
  });

  it("returns generic message for null/undefined errors", () => {
    expect(authErrorUserMessage(null)).toBe("Could not sign in. Please try again.");
    expect(authErrorUserMessage(undefined)).toBe("Could not sign in. Please try again.");
  });
});
