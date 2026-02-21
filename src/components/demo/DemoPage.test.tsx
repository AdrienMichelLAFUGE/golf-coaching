import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DemoPage from "./DemoPage";

describe("DemoPage", () => {
  it("renders core CTAs and no mode libre toggle", () => {
    render(<DemoPage />);
    expect(screen.getByRole("button", { name: /Démarrer la démo/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Mode libre")).not.toBeInTheDocument();
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
