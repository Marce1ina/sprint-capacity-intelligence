export class TokenEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenEncryptionError";
  }
}

const IV_LENGTH = 12;

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function importAesKey(keyBase64: string): Promise<CryptoKey> {
  if (!keyBase64) {
    throw new TokenEncryptionError("TOKEN_ENCRYPTION_KEY is not configured");
  }

  const keyBytes = Uint8Array.from(base64ToBytes(keyBase64));
  if (keyBytes.byteLength !== 32) {
    throw new TokenEncryptionError("TOKEN_ENCRYPTION_KEY must be 32 bytes when base64-decoded");
  }

  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptTokenPayload(plaintext: string, key: string): Promise<string> {
  const cryptoKey = await importAesKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoded);

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return bytesToBase64(combined);
}

export async function decryptTokenPayload(ciphertext: string, key: string): Promise<unknown> {
  let combined: Uint8Array;
  try {
    combined = base64ToBytes(ciphertext);
  } catch {
    throw new TokenEncryptionError("Invalid encrypted payload encoding");
  }

  if (combined.byteLength <= IV_LENGTH) {
    throw new TokenEncryptionError("Invalid encrypted payload");
  }

  const iv = combined.slice(0, IV_LENGTH);
  const encrypted = combined.slice(IV_LENGTH);
  const cryptoKey = await importAesKey(key);

  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encrypted);
    const plaintext = new TextDecoder().decode(decrypted);
    return JSON.parse(plaintext);
  } catch {
    throw new TokenEncryptionError("Failed to decrypt token payload");
  }
}
