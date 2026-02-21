import { render, screen } from "@testing-library/react";
import DemoRoutePage from "./page";

const SECTION_IDS = [
  "hero",
  "add-student",
  "student-dashboard",
  "create-report",
  "editor-ai",
  "media-data",
  "publish-read",
  "coach-dashboard",
  "season-calendar",
  "structure-mode",
  "final-cta",
] as const;

describe("/demo page", () => {
  it("renders all expected sections without mode libre toggle", () => {
    const { container } = render(<DemoRoutePage />);

    SECTION_IDS.forEach((sectionId) => {
      expect(
        container.querySelector(`[data-demo-section-id="${sectionId}"]`)
      ).toBeInTheDocument();
    });

    expect(screen.queryByLabelText("Mode libre")).not.toBeInTheDocument();
  });
});
