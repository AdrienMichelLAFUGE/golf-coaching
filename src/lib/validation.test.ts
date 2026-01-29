import { z } from "zod";
import { formatZodError, parseRequestJson } from "./validation";

describe("validation helpers", () => {
  it("returns a schema error when JSON parsing fails", async () => {
    const req = {
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as Request;

    const schema = z.object({ email: z.string().email() });
    const result = await parseRequestJson(req, schema);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("returns parsed data when JSON matches schema", async () => {
    const req = {
      json: async () => ({ email: "test@example.com" }),
    } as Request;

    const schema = z.object({ email: z.string().email() });
    const result = await parseRequestJson(req, schema);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("test@example.com");
    }
  });

  it("formats zod errors with field details", () => {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(2),
    });

    const result = schema.safeParse({ email: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = formatZodError(result.error);
      expect(formatted.message).toBe("Invalid payload.");
      expect(formatted.fields.email).toBeDefined();
      expect(formatted.fields.name).toBeDefined();
    }
  });
});
