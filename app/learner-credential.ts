const PBKDF2_ALGORITHM = "pbkdf2-sha256";
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTE_LENGTH = 16;
const HASH_BIT_LENGTH = 256;

export async function createPbkdf2CredentialVerifier(
  credential: string,
  salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH)),
): Promise<string> {
  const credentialHash = await derivePbkdf2Hash(
    credential,
    salt,
    PBKDF2_ITERATIONS,
    HASH_BIT_LENGTH,
  );

  return [
    PBKDF2_ALGORITHM,
    PBKDF2_ITERATIONS,
    encodeBase64Url(salt),
    encodeBase64Url(credentialHash),
  ].join("$");
}

export async function verifyPbkdf2Credential(
  credential: string,
  verifier: string,
): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedHashText, ...rest] =
    verifier.split("$");
  const iterations = Number(iterationsText);
  if (
    algorithm !== PBKDF2_ALGORITHM
    || !Number.isSafeInteger(iterations)
    || iterations < 1
    || !saltText
    || !expectedHashText
    || rest.length > 0
  ) {
    return false;
  }

  const salt = decodeBase64Url(saltText);
  const expectedHash = decodeBase64Url(expectedHashText);
  if (!salt || !expectedHash || expectedHash.length === 0) return false;

  const actualHash = await derivePbkdf2Hash(
    credential,
    salt,
    iterations,
    expectedHash.length * 8,
  );

  return equalBytes(actualHash, expectedHash);
}

async function derivePbkdf2Hash(
  credential: string,
  salt: Uint8Array,
  iterations: number,
  bitLength: number,
): Promise<Uint8Array> {
  const credentialKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(credential),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt,
    iterations,
  }, credentialKey, bitLength));
}

function encodeBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(
    bytes,
    (byte) => String.fromCharCode(byte),
  ).join("");

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(base64 + padding);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ (right[index] ?? 0);
  }

  return difference === 0;
}
