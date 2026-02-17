import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/parent/access", () => ({
  loadParentLinkedStudentContext: jest.fn(),
  loadParentLinkedStudentIds: jest.fn(),
}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const ALIAS_STUDENT_ID = "22222222-2222-2222-2222-222222222222";

const buildRequest = () =>
  ({
    headers: new Headers(),
  }) as Request;

describe("GET /api/parent/children/[id]/reports", () => {
  const parentAccessMocks = jest.requireMock("@/lib/parent/access") as {
    loadParentLinkedStudentContext: jest.Mock;
    loadParentLinkedStudentIds: jest.Mock;
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

  it("loads reports for all linked student ids of the same child account", async () => {
    const reportsOrderSecond = jest.fn(async () => ({
      data: [
        {
          id: "report-1",
          title: "Rapport alias",
          report_date: "2026-02-10",
          created_at: "2026-02-10T10:00:00.000Z",
          sent_at: "2026-02-10T11:00:00.000Z",
        },
      ],
      error: null,
    }));
    const reportsOrderFirst = jest.fn(() => ({ order: reportsOrderSecond }));
    const reportsNot = jest.fn(() => ({ order: reportsOrderFirst }));
    const reportsIn = jest.fn(() => ({ not: reportsNot }));
    const reportsSelect = jest.fn(() => ({ in: reportsIn }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "reports") {
          return {
            select: reportsSelect,
          };
        }
        return {};
      }),
    };

    parentAccessMocks.loadParentLinkedStudentContext.mockResolvedValue({
      context: {
        admin,
        studentId: STUDENT_ID,
      },
      failure: null,
    });
    parentAccessMocks.loadParentLinkedStudentIds.mockResolvedValue([
      STUDENT_ID,
      ALIAS_STUDENT_ID,
    ]);

    const response = await GET(buildRequest(), { params: { id: STUDENT_ID } });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].title).toBe("Rapport alias");
    expect(parentAccessMocks.loadParentLinkedStudentIds).toHaveBeenCalledWith(
      admin,
      STUDENT_ID
    );
    expect(reportsIn).toHaveBeenCalledWith("student_id", [
      STUDENT_ID,
      ALIAS_STUDENT_ID,
    ]);
  });
});

