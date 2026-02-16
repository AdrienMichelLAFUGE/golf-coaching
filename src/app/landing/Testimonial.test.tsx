import { render, screen } from "@testing-library/react";
import Testimonial from "./Testimonial";

describe("Testimonial", () => {
  it("renders quote, identity and result", () => {
    render(
      <Testimonial
        quote="Une vraie clarte dans mon suivi."
        name="Coach Test"
        role="Head Coach"
        organization="Academie Test"
        result="Gain de temps visible"
      />
    );

    expect(screen.getByText('"Une vraie clarte dans mon suivi."')).toBeInTheDocument();
    expect(screen.getByText("Coach Test")).toBeInTheDocument();
    expect(screen.getByText("Head Coach - Academie Test")).toBeInTheDocument();
    expect(screen.getByText("Gain de temps visible")).toBeInTheDocument();
  });
});

