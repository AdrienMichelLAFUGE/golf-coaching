import { act, render, screen } from "@testing-library/react";
import DataPipelineMock from "./DataPipelineMock";
import { DEMO_MEDIA_FIXTURE, DEMO_SMART2MOVE } from "./fixtures";

describe("DataPipelineMock", () => {
  const handlers = {
    onSelectTechnology: jest.fn(),
    onImport: jest.fn(),
    onExtract: jest.fn(),
  };

  beforeEach(() => {
    handlers.onSelectTechnology.mockClear();
    handlers.onImport.mockClear();
    handlers.onExtract.mockClear();
  });

  it("forces Smart2Move in technology selection", () => {
    render(
      <DataPipelineMock
        importVisual={DEMO_MEDIA_FIXTURE.dataScene.importVisual}
        technology={null}
        imported={false}
        preprocessed={false}
        analyzed={false}
        smart2move={DEMO_SMART2MOVE}
        {...handlers}
      />
    );

    expect(screen.getByText("Smart2Move")).toBeInTheDocument();
    expect(screen.getAllByText(/verrouillé sur cette démo/i).length).toBeGreaterThan(0);
    expect(handlers.onSelectTechnology).toHaveBeenCalledWith("smart2move");
  });

  it("auto-places impact + transition after delays before extraction", () => {
    jest.useFakeTimers();
    try {
      render(
        <DataPipelineMock
          importVisual={DEMO_MEDIA_FIXTURE.dataScene.importVisual}
          technology="smart2move"
          imported={true}
          preprocessed={false}
          analyzed={false}
          smart2move={DEMO_SMART2MOVE}
          {...handlers}
        />
      );

      const extractButton = screen.getByRole("button", { name: "Extraire" });
      expect(extractButton).toBeDisabled();

      act(() => {
        jest.advanceTimersByTime(1300);
      });
      expect(screen.getByText(/Impact placé/i)).toBeInTheDocument();
      expect(extractButton).toBeDisabled();

      act(() => {
        jest.advanceTimersByTime(1200);
      });
      expect(screen.getByText(/Transition placée/i)).toBeInTheDocument();
      expect(extractButton).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });
});
