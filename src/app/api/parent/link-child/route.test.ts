import { POST } from "./route";

jest.mock("server-only", () => ({}));

jest.mock("@/lib/activity-log", () => ({
  recordActivity: jest.fn(),
}));

jest.mock("@/lib/parent/access", () => ({
  loadParentAuthContext: jest.fn(),
}));

const buildRequest = () =>
  ({
    headers: new Headers(),
  }) as Request;

describe("POST /api/parent/link-child", () => {
  const parentAccessMocks = jest.requireMock("@/lib/parent/access") as {
    loadParentAuthContext: jest.Mock;
  };
  const activityMocks = jest.requireMock("@/lib/activity-log") as {
    recordActivity: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns auth failure when caller is not an authenticated parent", async () => {
    parentAccessMocks.loadParentAuthContext.mockResolvedValue({
      context: null,
      failure: { status: 403, error: "Acces refuse." },
    });

    const response = await POST(buildRequest());

    expect(response.status).toBe(403);
    expect(activityMocks.recordActivity).not.toHaveBeenCalled();
  });

  it("blocks legacy flow and returns 410", async () => {
    const admin = {
      from: jest.fn(),
    };

    parentAccessMocks.loadParentAuthContext.mockResolvedValue({
      context: {
        admin,
        parentUserId: "parent-1",
        parentEmail: "parent@example.com",
      },
      failure: null,
    });

    const response = await POST(buildRequest());

    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.error).toBe(
      "Le rattachement direct est desactive. Utilisez une invitation parent securisee."
    );
    expect(activityMocks.recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "parent.child_link.legacy_blocked",
        actorUserId: "parent-1",
        level: "warn",
      })
    );
  });
});
