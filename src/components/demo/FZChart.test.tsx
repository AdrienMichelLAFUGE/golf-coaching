import { render, screen } from "@testing-library/react";
import FZChart from "./FZChart";
import { DEMO_SMART2MOVE } from "./fixtures";

describe("FZChart", () => {
  it("renders chart image and impact marker", () => {
    render(<FZChart smart2move={DEMO_SMART2MOVE} />);

    expect(screen.getByAltText("Graphique Force Zone Smart2Move")).toBeInTheDocument();
    expect(screen.getByTestId("impact-marker")).toBeInTheDocument();
  });

  it("renders fallback when forced", () => {
    render(<FZChart smart2move={DEMO_SMART2MOVE} forceFallback />);

    expect(screen.getByTestId("fz-fallback")).toBeInTheDocument();
  });
});
