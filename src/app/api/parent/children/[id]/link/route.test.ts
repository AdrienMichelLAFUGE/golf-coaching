import { DELETE } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/parent/access", () => ({
  loadParentAuthContext: jest.fn(),
}));

const buildRequest = () =>
  ({
    headers: new Headers(),
  }) as Request;

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";

describe("DELETE /api/parent/children/[id]/link", () => {
  const parentAccessMocks = jest.requireMock("@/lib/parent/access") as {
    loadParentAuthContext: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 422 for invalid student id", async () => {
    const response = await DELETE(buildRequest(), { params: { id: "invalid" } });
    expect(response.status).toBe(422);
  });

  it("returns auth failure when parent context is missing", async () => {
    parentAccessMocks.loadParentAuthContext.mockResolvedValue({
      context: null,
      failure: { status: 403, error: "Acces refuse." },
    });

    const response = await DELETE(buildRequest(), { params: { id: STUDENT_ID } });
    expect(response.status).toBe(403);
  });

  it("soft-revokes the active link", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "parent_child_links") return {};
        const chain = {
          eq: () => chain,
          select: () => ({
            maybeSingle: async () => ({
              data: { id: "link-1" },
              error: null,
            }),
          }),
        };
        return {
          update: () => chain,
        };
      }),
    };

    parentAccessMocks.loadParentAuthContext.mockResolvedValue({
      context: {
        admin,
        parentUserId: "parent-1",
      },
      failure: null,
    });

    const response = await DELETE(buildRequest(), { params: { id: STUDENT_ID } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });
});

