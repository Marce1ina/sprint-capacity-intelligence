import { describe, expect, it } from "vitest";
import { SECRET_PROBE, TEST_ENCRYPTION_KEY } from "@/test/fixtures";
import { assertNoSecretProbe } from "@/test/secret-scan";
import { decryptTokenPayload, encryptTokenPayload, TokenEncryptionError } from "@/lib/crypto/token-encryption";

describe("token encryption", () => {
  it("round-trips plaintext through encrypt and decrypt", async () => {
    const payload = JSON.stringify({ pat: SECRET_PROBE, siteUrl: "https://testorg.atlassian.net" });
    const ciphertext = await encryptTokenPayload(payload, TEST_ENCRYPTION_KEY);

    expect(ciphertext).not.toContain(SECRET_PROBE);

    const decrypted = await decryptTokenPayload(ciphertext, TEST_ENCRYPTION_KEY);
    expect(decrypted).toEqual(JSON.parse(payload));
  });

  it("throws TokenEncryptionError with no plaintext in message on invalid ciphertext", async () => {
    const plaintext = SECRET_PROBE;

    await expect(decryptTokenPayload("not-valid-base64!!!", TEST_ENCRYPTION_KEY)).rejects.toSatisfy(
      (error: unknown) => {
        expect(error).toBeInstanceOf(TokenEncryptionError);
        const message = (error as TokenEncryptionError).message;
        assertNoSecretProbe({ message }, plaintext);
        return true;
      },
    );
  });

  it("throws when encryption key is missing or wrong length", async () => {
    await expect(encryptTokenPayload("test", "")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(TokenEncryptionError);
      assertNoSecretProbe({ message: (error as TokenEncryptionError).message }, SECRET_PROBE);
      return true;
    });
  });
});
