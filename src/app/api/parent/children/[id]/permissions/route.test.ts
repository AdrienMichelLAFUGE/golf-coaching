import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/parent/access", () => ({
  loadParentLinkedStudentContext: jest.fn(),
}));

const buildRequest = () =>
  ({
    headers: new Headers(),
  }) as Request;

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";

describe("GET /api/parent/children/[id]/permissions", () => {
  const accessMocks = jest.requireMock("@/lib/parent/access") as {
    loadParentLinkedStudentContext: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when parent access is denied", async () => {
    accessMocks.loadParentLinkedStudentContext.mockResolvedValue({
      context: null,
      failure: { status: 403, error: "Acces refuse." },
    });

    const response = await GET(buildRequest(), { params: { id: STUDENT_ID } });
    expect(response.status).toBe(403);
  });

  it("returns effective parent permissions", async () => {
    accessMocks.loadParentLinkedStudentContext.mockResolvedValue({
      context: {
        studentId: STUDENT_ID,
        parentPermissions: {
          dashboard: true,
          rapports: true,
          tests: false,
          calendrier: true,
          messages: false,
        },
      },
      failure: null,
    });

    const response = await GET(buildRequest(), { params: { id: STUDENT_ID } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permissions).toEqual({
      dashboard: true,
      rapports: true,
      tests: false,
      calendrier: true,
      messages: false,
    });
  });
});

