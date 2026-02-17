import { GET } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/parent/access", () => ({
  loadParentLinkedStudentContext: jest.fn(),
  loadParentLinkedStudentIds: jest.fn(),
}));

const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const ALIAS_STUDENT_ID = "22222222-2222-2222-2222-222222222222";
const REPORT_ID = "33333333-3333-3333-3333-333333333333";

const buildRequest = () =>
  ({
    headers: new Headers(),
  }) as Request;

describe("GET /api/parent/children/[id]/reports/[reportId]", () => {
  const parentAccessMocks = jest.requireMock("@/lib/parent/access") as {
    loadParentLinkedStudentContext: jest.Mock;
    loadParentLinkedStudentIds: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when parent is not linked", async () => {
    parentAccessMocks.loadParentLinkedStudentContext.mockResolvedValue({
      context: null,
      failure: { status: 403, error: "Acces refuse." },
    });

    const response = await GET(buildRequest(), {
      params: { id: STUDENT_ID, reportId: REPORT_ID },
    });

    expect(response.status).toBe(403);
  });

  it("allows report detail lookup on sibling student ids from same child account", async () => {
    const reportsIn = jest.fn(() => ({
      maybeSingle: async () => ({
        data: {
          id: REPORT_ID,
          title: "Rapport detail",
          report_date: "2026-02-10",
          created_at: "2026-02-10T10:00:00.000Z",
          sent_at: "2026-02-10T11:00:00.000Z",
          coach_observations: null,
          coach_work: null,
          coach_club: null,
          student_id: ALIAS_STUDENT_ID,
        },
        error: null,
      }),
    }));
    const reportsEq = jest.fn(() => ({ in: reportsIn }));
    const reportsSelect = jest.fn(() => ({ eq: reportsEq }));

    const sectionsOrder = jest.fn(async () => ({
      data: [
        {
          id: "section-1",
          title: "Synthese",
          type: "text",
          content: "Contenu",
          content_formatted: "Contenu",
          media_urls: [],
          media_captions: [],
          position: 0,
        },
      ],
      error: null,
    }));
    const sectionsEq = jest.fn(() => ({ order: sectionsOrder }));
    const sectionsSelect = jest.fn(() => ({ eq: sectionsEq }));

    const admin = {
      from: jest.fn((table: string) => {
        if (table === "reports") {
          return {
            select: reportsSelect,
          };
        }
        if (table === "report_sections") {
          return {
            select: sectionsSelect,
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

    const response = await GET(buildRequest(), {
      params: { id: STUDENT_ID, reportId: REPORT_ID },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.id).toBe(REPORT_ID);
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
