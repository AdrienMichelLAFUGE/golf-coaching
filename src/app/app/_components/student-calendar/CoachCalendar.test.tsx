import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CoachCalendar from "./CoachCalendar";

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

const buildIso = (dayOffset: number, hour: number, minute = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + dayOffset);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};

describe("CoachCalendar", () => {
  const supabaseMocks = jest.requireMock("@/lib/supabase/client") as {
    supabase: {
      auth: {
        getSession: jest.Mock;
      };
    };
  };

  beforeEach(() => {
    supabaseMocks.supabase.auth.getSession.mockReset();
    supabaseMocks.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "token-test" } },
    });
    global.fetch = jest.fn();
  });

  it("applies type and student filters", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            studentId: "11111111-1111-1111-1111-111111111111",
            title: "Competition regionale",
            type: "competition",
            startAt: buildIso(0, 9),
            endAt: buildIso(0, 12),
            allDay: false,
            location: "Golf Club",
            notes: null,
            createdBy: "99999999-9999-9999-9999-999999999999",
            updatedBy: "99999999-9999-9999-9999-999999999999",
            createdAt: buildIso(-1, 8),
            updatedAt: buildIso(-1, 8),
            version: 1,
            resultsEnabled: false,
            resultsRoundsPlanned: null,
            resultsRounds: [],
            studentName: "Alice Martin",
            studentAvatarUrl: null,
          },
          {
            id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
            studentId: "22222222-2222-2222-2222-222222222222",
            title: "Session technique",
            type: "training",
            startAt: buildIso(0, 14),
            endAt: buildIso(0, 15),
            allDay: false,
            location: "Practice",
            notes: "Travail face",
            createdBy: "99999999-9999-9999-9999-999999999999",
            updatedBy: "99999999-9999-9999-9999-999999999999",
            createdAt: buildIso(-1, 8),
            updatedAt: buildIso(-1, 8),
            version: 1,
            resultsEnabled: false,
            resultsRoundsPlanned: null,
            resultsRounds: [],
            studentName: "Benoit Durand",
            studentAvatarUrl: null,
          },
        ],
        students: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Alice Martin",
            avatarUrl: null,
          },
          {
            id: "22222222-2222-2222-2222-222222222222",
            name: "Benoit Durand",
            avatarUrl: null,
          },
        ],
      }),
    } as unknown as Response);

    render(<CoachCalendar />);

    expect(await screen.findByText("Competition regionale")).toBeInTheDocument();
    expect(screen.getByText("Session technique")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Competition" }));

    await waitFor(() => {
      expect(screen.queryByText("Competition regionale")).not.toBeInTheDocument();
      expect(screen.getByText("Session technique")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Filtrer par eleve"), {
      target: { value: "11111111-1111-1111-1111-111111111111" },
    });

    await waitFor(() => {
      expect(screen.queryByText("Session technique")).not.toBeInTheDocument();
    });
  });

  it("opens drawer with participants and student links", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            studentId: "11111111-1111-1111-1111-111111111111",
            title: "Tournoi club",
            type: "tournament",
            startAt: buildIso(0, 9),
            endAt: buildIso(0, 12),
            allDay: false,
            location: "Golf Club",
            notes: "Objectif top 10",
            createdBy: "99999999-9999-9999-9999-999999999999",
            updatedBy: "99999999-9999-9999-9999-999999999999",
            createdAt: buildIso(-1, 8),
            updatedAt: buildIso(-1, 8),
            version: 1,
            resultsEnabled: false,
            resultsRoundsPlanned: null,
            resultsRounds: [],
            studentName: "Alice Martin",
            studentAvatarUrl: null,
          },
        ],
        students: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            name: "Alice Martin",
            avatarUrl: null,
          },
        ],
      }),
    } as unknown as Response);

    render(<CoachCalendar />);

    const eventCard = await screen.findByRole("button", { name: /Tournoi club/i });
    fireEvent.click(eventCard);

    expect(await screen.findByText("Detail evenement")).toBeInTheDocument();
    expect(screen.getByText("Eleves concernes")).toBeInTheDocument();
    const studentLink = screen.getByRole("link", { name: /Alice Martin/i });
    expect(studentLink).toHaveAttribute(
      "href",
      "/app/coach/eleves/11111111-1111-1111-1111-111111111111"
    );
  });
});
