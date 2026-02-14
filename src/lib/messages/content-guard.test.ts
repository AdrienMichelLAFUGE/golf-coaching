import {
  detectMessageContentFlags,
  shouldBlockMessageForMinorThread,
} from "@/lib/messages/content-guard";

describe("messages content guard", () => {
  it("detects contact details, urls, and configured keywords", () => {
    const flags = detectMessageContentFlags(
      "Contacte moi sur test@example.com ou https://example.com - tel +33 6 12 34 56 78, mot secret",
      ["secret", "urgent"]
    );

    expect(flags.some((flag) => flag.type === "email")).toBe(true);
    expect(flags.some((flag) => flag.type === "phone")).toBe(true);
    expect(flags.some((flag) => flag.type === "url")).toBe(true);
    expect(flags.some((flag) => flag.type === "keyword")).toBe(true);
  });

  it("deduplicates repeated matches", () => {
    const flags = detectMessageContentFlags(
      "email test@example.com puis encore test@example.com",
      []
    );

    const emails = flags.filter((flag) => flag.type === "email");
    expect(emails).toHaveLength(1);
  });

  it("blocks only when policy is block and thread is minor", () => {
    const flags = detectMessageContentFlags("www.example.com", []);

    expect(shouldBlockMessageForMinorThread("flag", true, flags)).toBe(false);
    expect(shouldBlockMessageForMinorThread("block", false, flags)).toBe(false);
    expect(shouldBlockMessageForMinorThread("block", true, flags)).toBe(true);
  });
});
