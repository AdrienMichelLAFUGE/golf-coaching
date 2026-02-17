import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/parent/access", () => ({
  loadParentLinkedStudentContext: jest.fn(),
}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";

const buildRequest = () =>
  ({
    headers: new Headers(),
  }) as Request;

describe("GET /api/parent/children/[id]", () => {
  const parentAccessMocks = jest.requireMock("@/lib/parent/access") as {
    loadParentLinkedStudentContext: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 422 for invalid student id", async () => {
    const response = await GET(buildRequest(), { params: { id: "invalid" } });

    expect(response.status).toBe(422);
  });

  it("returns 403 when parent is not linked", async () => {
    parentAccessMocks.loadParentLinkedStudentContext.mockResolvedValue({
      context: null,
      failure: { status: 403, error: "Acces refuse." },
    });

    const response = await GET(buildRequest(), { params: { id: STUDENT_ID } });

    expect(response.status).toBe(403);
  });

  it("returns child payload for linked parent", async () => {
    parentAccessMocks.loadParentLinkedStudentContext.mockResolvedValue({
      context: {
        studentId: STUDENT_ID,
        studentFirstName: "Leo",
        studentLastName: "Martin",
        studentEmail: "leo@example.com",
      },
      failure: null,
    });

    const response = await GET(buildRequest(), { params: { id: STUDENT_ID } });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.child).toEqual({
      id: STUDENT_ID,
      firstName: "Leo",
      lastName: "Martin",
      fullName: "Leo Martin",
      email: "leo@example.com",
    });
  });
});
