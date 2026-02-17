import "server-only";

import crypto from "node:crypto";

const SECRET_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PARENT_SECRET_CODE_LENGTH = 8;
export const PARENT_SECRET_CODE_PATTERN = /^[A-Z0-9]{8}$/;

const randomAlphabetChar = () => {
  const randomIndex = crypto.randomInt(0, SECRET_CODE_ALPHABET.length);
  return SECRET_CODE_ALPHABET[randomIndex] ?? "A";
};

export const normalizeParentSecretCode = (value: string) =>
  value.trim().toUpperCase();

export const generateParentSecretCode = () => {
  let code = "";
  for (let index = 0; index < PARENT_SECRET_CODE_LENGTH; index += 1) {
    code += randomAlphabetChar();
  }
  return code;
};

const sha256Hex = (value: string) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

export const hashParentSecretCode = (secretCode: string, salt?: string) => {
  const normalizedCode = normalizeParentSecretCode(secretCode);
  if (!PARENT_SECRET_CODE_PATTERN.test(normalizedCode)) {
    throw new Error("Invalid parent secret code format.");
  }

  const effectiveSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const digest = sha256Hex(`${effectiveSalt}:${normalizedCode}`);
  return `sha256$${effectiveSalt}$${digest}`;
};

const parseHashValue = (storedHash: string) => {
  const [algorithm, salt, digest] = storedHash.split("$");
  if (
    algorithm !== "sha256" ||
    !salt ||
    !digest ||
    !/^[0-9a-f]{32}$/i.test(salt) ||
    !/^[0-9a-f]{64}$/i.test(digest)
  ) {
    return null;
  }
  return {
    salt: salt.toLowerCase(),
    digest: digest.toLowerCase(),
  };
};

export const verifyParentSecretCode = (inputCode: string, storedHash: string) => {
  const parsed = parseHashValue(storedHash);
  if (!parsed) return false;

  const normalizedCode = normalizeParentSecretCode(inputCode);
  if (!PARENT_SECRET_CODE_PATTERN.test(normalizedCode)) return false;

  const candidateDigest = sha256Hex(`${parsed.salt}:${normalizedCode}`);
  return crypto.timingSafeEqual(
    Buffer.from(candidateDigest, "hex"),
    Buffer.from(parsed.digest, "hex")
  );
};
