import {
  loadStudentParentSecretCodeMetadata,
  regenerateStudentParentSecretCode,
} from "./student-secret-code-service";

jest.mock("server-only", () => ({}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";

describe("student secret code service", () => {
  it("loads metadata without exposing plain secret", async () => {
    const admin = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: STUDENT_ID,
                parent_secret_code_hash:
                  "sha256$0123456789abcdef0123456789abcdef$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                parent_secret_code_rotated_at: "2026-02-18T00:00:00.000Z",
              },
              error: null,
            }),
          }),
        }),
      })),
    } as unknown as ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;

    const metadata = await loadStudentParentSecretCodeMetadata(admin, STUDENT_ID);
    expect(metadata).toEqual({
      studentId: STUDENT_ID,
      rotatedAt: "2026-02-18T00:00:00.000Z",
      hasSecretCode: true,
    });
  });

  it("regenerates one-shot code and stores hash only", async () => {
    let updatePayload: Record<string, unknown> | null = null;
    const admin = {
      from: jest.fn(() => ({
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload;
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: STUDENT_ID,
                    parent_secret_code_rotated_at: "2026-02-18T00:01:00.000Z",
                  },
                  error: null,
                }),
              }),
            }),
          };
        },
      })),
    } as unknown as ReturnType<typeof import("@/lib/supabase/server").createSupabaseAdminClient>;

    const result = await regenerateStudentParentSecretCode(admin, STUDENT_ID);

    expect(result?.studentId).toBe(STUDENT_ID);
    expect(result?.secretCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(result?.rotatedAt).toBe("2026-02-18T00:01:00.000Z");
    expect(updatePayload).toEqual(
      expect.objectContaining({
        parent_secret_code_plain: null,
        parent_secret_code_hash: expect.stringMatching(
          /^sha256\$[0-9a-f]{32}\$[0-9a-f]{64}$/
        ),
        parent_secret_code_rotated_at: expect.any(String),
      })
    );
  });
});

