import {
  PARENT_SECRET_CODE_PATTERN,
  generateParentSecretCode,
  hashParentSecretCode,
  verifyParentSecretCode,
} from "./secret-code";

jest.mock("server-only", () => ({}));

describe("parent secret code helpers", () => {
  it("generates an 8-char uppercase alphanumeric code", () => {
    const code = generateParentSecretCode();
    expect(code).toHaveLength(8);
    expect(PARENT_SECRET_CODE_PATTERN.test(code)).toBe(true);
  });

  it("hashes and verifies a code", () => {
    const hash = hashParentSecretCode("A7K3P9Q2", "0123456789abcdef0123456789abcdef");
    expect(hash.startsWith("sha256$")).toBe(true);
    expect(verifyParentSecretCode("A7K3P9Q2", hash)).toBe(true);
  });

  it("fails verification with wrong code", () => {
    const hash = hashParentSecretCode("A7K3P9Q2", "0123456789abcdef0123456789abcdef");
    expect(verifyParentSecretCode("ZZZZ9999", hash)).toBe(false);
  });
});
