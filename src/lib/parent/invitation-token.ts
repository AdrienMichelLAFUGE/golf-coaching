import "server-only";

import crypto from "node:crypto";

const INVITATION_TOKEN_LENGTH_BYTES = 32;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

const sha256Hex = (value: string) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

export const normalizeParentInvitationToken = (value: string) => value.trim();

export const generateParentInvitationToken = () =>
  crypto.randomBytes(INVITATION_TOKEN_LENGTH_BYTES).toString("base64url");

export const hashParentInvitationToken = (token: string) => {
  const normalized = normalizeParentInvitationToken(token);
  if (!INVITATION_TOKEN_PATTERN.test(normalized)) {
    throw new Error("Invalid parent invitation token format.");
  }
  return sha256Hex(normalized);
};
