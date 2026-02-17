import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DemoPage from "./DemoPage";

describe("DemoPage", () => {
  it("shows coachmarks in guided mode by default", () => {
    render(<DemoPage />);
    expect(screen.getAllByTestId("coachmark").length).toBeGreaterThan(0);
  });

  it("hides coachmarks when switching to mode libre", async () => {
    const user = userEvent.setup();
    render(<DemoPage />);

    await user.click(screen.getByLabelText("Mode libre"));

    expect(screen.queryAllByTestId("coachmark")).toHaveLength(0);
  });

  it("updates IA axis selection in the editor flow", async () => {
    const user = userEvent.setup();
    render(<DemoPage />);

    await user.click(screen.getByRole("button", { name: /Axe 1.*Neutraliser le plan/i }));

    expect(
      screen.getAllByText(/Axe sélectionné: Axe 1.*Neutraliser le plan/i).length
    ).toBeGreaterThan(0);
  });
});
