const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

function decodeBase32(value: string): Uint8Array | null {
  const normalized = value
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/=+$/, "");

  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) {
    return null;
  }

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      return null;
    }

    buffer = (buffer << 5) | index;
    bits += 5;

    while (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

function movingFactor(time: number, periodSeconds: number): Uint8Array {
  let counter = BigInt(Math.floor(time / 1000 / periodSeconds));
  const bytes = new Uint8Array(8);

  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(counter & 0xffn);
    counter >>= 8n;
  }

  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

export function isTotpSecret(value: string | undefined): value is string {
  return Boolean(value && decodeBase32(value));
}

export async function generateTotp(
  secret: string,
  time = Date.now(),
  digits = TOTP_DIGITS,
  periodSeconds = TOTP_PERIOD_SECONDS,
): Promise<string | null> {
  const keyData = decodeBase32(secret);
  if (!keyData || !Number.isInteger(digits) || digits < 6 || digits > 8) {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyData),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, toArrayBuffer(movingFactor(time, periodSeconds))),
  );
  const offset = signature[signature.length - 1] & 0x0f;
  const binaryCode =
    ((signature[offset] & 0x7f) << 24) |
    (signature[offset + 1] << 16) |
    (signature[offset + 2] << 8) |
    signature[offset + 3];

  return String(binaryCode % 10 ** digits).padStart(digits, "0");
}

export async function verifyTotp(
  secret: string,
  code: string,
  time = Date.now(),
): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  for (const offset of [-1, 0, 1]) {
    const expected = await generateTotp(
      secret,
      time + offset * TOTP_PERIOD_SECONDS * 1000,
    );

    if (expected && constantTimeEqual(expected, code)) {
      return true;
    }
  }

  return false;
}
