import {
  buildTimelineDates,
  getInitials,
  groupCoachEvents,
  type CoachCalendarEvent,
} from "./utils";

const BASE_EVENT: CoachCalendarEvent = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  studentId: "11111111-1111-1111-1111-111111111111",
  title: "Tournoi regional",
  type: "tournament",
  startAt: "2026-02-17T09:00:00.000Z",
  endAt: "2026-02-17T12:00:00.000Z",
  allDay: false,
  location: "Golf Club",
  notes: "Briefing",
  createdBy: "99999999-9999-9999-9999-999999999999",
  updatedBy: "99999999-9999-9999-9999-999999999999",
  createdAt: "2026-02-10T10:00:00.000Z",
  updatedAt: "2026-02-10T10:00:00.000Z",
  version: 1,
  resultsEnabled: false,
  resultsRoundsPlanned: null,
  resultsRounds: [],
  studentName: "Alice Martin",
  studentAvatarUrl: "https://cdn.test/alice.png",
};

describe("student-calendar utils", () => {
  it("builds a 7-day timeline from selected date", () => {
    const dates = buildTimelineDates(new Date(2026, 1, 17, 15, 30, 0, 0), 7);
    expect(dates).toHaveLength(7);
    expect(dates[0]?.getFullYear()).toBe(2026);
    expect(dates[0]?.getMonth()).toBe(1);
    expect(dates[0]?.getDate()).toBe(17);
    expect(dates[6]?.getFullYear()).toBe(2026);
    expect(dates[6]?.getMonth()).toBe(1);
    expect(dates[6]?.getDate()).toBe(23);
  });

  it("groups coach events by slot and aggregates participants", () => {
    const grouped = groupCoachEvents([
      BASE_EVENT,
      {
        ...BASE_EVENT,
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        studentId: "22222222-2222-2222-2222-222222222222",
        studentName: "Benoit Durand",
        studentAvatarUrl: null,
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.participants).toEqual([
      {
        studentId: "11111111-1111-1111-1111-111111111111",
        name: "Alice Martin",
        avatarUrl: "https://cdn.test/alice.png",
      },
      {
        studentId: "22222222-2222-2222-2222-222222222222",
        name: "Benoit Durand",
        avatarUrl: null,
      },
    ]);
  });

  it("builds initials from a participant name", () => {
    expect(getInitials("Alice Martin")).toBe("AM");
    expect(getInitials("Benoit")).toBe("BE");
    expect(getInitials("   ")).toBe("??");
  });
});
