import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarMock from "./CalendarMock";

describe("CalendarMock", () => {
  it("renders event dots without infinite blinking classes", () => {
    render(<CalendarMock mode="student" />);

    const dots = screen.getAllByTestId("calendar-event-dot");
    expect(dots.length).toBeGreaterThan(0);
    dots.forEach((dot) => {
      expect(dot.className).not.toMatch(/infinite/i);
    });
  });

  it("builds a stable month grid without duplicated date keys", () => {
    render(<CalendarMock mode="student" />);

    const cells = screen.getAllByTestId("calendar-day-cell");
    expect(cells).toHaveLength(42);

    const keys = cells
      .map((cell) => cell.getAttribute("data-date-key"))
      .filter((value): value is string => value !== null);
    expect(new Set(keys).size).toBe(42);
  });

  it("shows 7-day agenda by default and can collapse it", async () => {
    const user = userEvent.setup();
    render(<CalendarMock mode="coach" />);

    expect(screen.getByText(/Prochains jours/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Masquer agenda 7 jours/i }));
    expect(screen.queryByText(/Prochains jours/i)).not.toBeInTheDocument();
  });

  it("shows participant avatars in coach day view", () => {
    render(<CalendarMock mode="coach" />);
    expect(screen.getAllByTestId("calendar-participant-avatars").length).toBeGreaterThan(0);
  });

  it("shows medals in student calendar cells for past results", () => {
    render(<CalendarMock mode="student" />);
    expect(screen.getAllByText(/🥇|🥈|🥉/u).length).toBeGreaterThan(0);
  });
});
