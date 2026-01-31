import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import PelzDiagramModal from "./pelz-diagram-modal";

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: () => ({ data: { publicUrl: "https://example.com/diagram.png" } }),
      }),
    },
  },
}));

const DiagramHarness = () => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Schema
      </button>
      <PelzDiagramModal
        open={open}
        onClose={() => setOpen(false)}
        title="Putt long"
        alt="Putt long - situations A=13m, B=19m, C=25m"
        diagramKey="putt-long"
      />
    </div>
  );
};

describe("PelzDiagramModal", () => {
  it("opens on schema click", async () => {
    render(<DiagramHarness />);

    fireEvent.click(screen.getByText("Schema"));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Putt long")).toBeInTheDocument();
    expect(
      screen.getByAltText("Putt long - situations A=13m, B=19m, C=25m")
    ).toBeInTheDocument();
  });
});
