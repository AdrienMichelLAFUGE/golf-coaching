import { fireEvent, render, screen } from "@testing-library/react";
import PelzResponsiveAccordion from "./pelz-responsive-accordion";

describe("PelzResponsiveAccordion", () => {
  it("toggles mobile accordion and keeps desktop layout", () => {
    render(
      <PelzResponsiveAccordion
        mobileItems={[
          { id: "one", label: "Section 1", content: <div>Contenu 1</div> },
          { id: "two", label: "Section 2", content: <div>Contenu 2</div> },
        ]}
        desktopContent={<div>Desktop layout</div>}
      />
    );

    const firstButton = screen.getByRole("button", { name: "Section 1" });
    const secondButton = screen.getByRole("button", { name: "Section 2" });

    expect(firstButton).toHaveAttribute("aria-expanded", "true");
    expect(secondButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(secondButton);
    expect(firstButton).toHaveAttribute("aria-expanded", "false");
    expect(secondButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(secondButton);
    expect(secondButton).toHaveAttribute("aria-expanded", "false");

    const desktop = screen.getByTestId("pelz-desktop-layout");
    expect(desktop).toHaveTextContent("Desktop layout");
  });
});
