import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/parent/access", () => ({
  loadParentAuthContext: jest.fn(),
}));

const buildRequest = () =>
  ({
    headers: new Headers(),
  }) as Request;

describe("GET /api/parent/children", () => {
  const parentAccessMocks = jest.requireMock("@/lib/parent/access") as {
    loadParentAuthContext: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns auth failure when parent auth context is missing", async () => {
    parentAccessMocks.loadParentAuthContext.mockResolvedValue({
      context: null,
      failure: { status: 401, error: "Unauthorized." },
    });

    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
  });

  it("returns linked children list for authenticated parent", async () => {
    const admin = {
      from: jest.fn((table: string) => {
        if (table !== "parent_child_links") return {};
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    student_id: "student-1",
                    students: {
                      id: "student-1",
                      first_name: "Leo",
                      last_name: "Martin",
                      email: "leo@example.com",
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
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

    const response = await GET(buildRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.children).toEqual([
      {
        id: "student-1",
        firstName: "Leo",
        lastName: "Martin",
        fullName: "Leo Martin",
        email: "leo@example.com",
      },
    ]);
  });
});
