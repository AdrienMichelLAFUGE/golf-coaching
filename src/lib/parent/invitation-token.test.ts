import {
  generateParentInvitationToken,
  hashParentInvitationToken,
  normalizeParentInvitationToken,
} from "./invitation-token";

describe("parent invitation token helpers", () => {
  it("normalizes surrounding spaces", () => {
    expect(normalizeParentInvitationToken("  token  ")).toBe("token");
  });

  it("generates url-safe random tokens", () => {
    const token = generateParentInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
  });

  it("hashes tokens with sha256 hex output", () => {
    const token = generateParentInvitationToken();
    const hash = hashParentInvitationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws on invalid token format", () => {
    expect(() => hashParentInvitationToken("bad token with spaces")).toThrow(
      "Invalid parent invitation token format."
    );
  });
});
