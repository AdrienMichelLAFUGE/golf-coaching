import { fireEvent, render, screen } from "@testing-library/react";
import PageBack from "./page-back";

const back = jest.fn();
const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    back,
    push,
  }),
}));

const setHistoryLength = (length: number) => {
  Object.defineProperty(window.history, "length", {
    configurable: true,
    value: length,
  });
};

describe("PageBack", () => {
  beforeEach(() => {
    back.mockReset();
    push.mockReset();
  });

  it("renders a back button", () => {
    render(<PageBack />);
    expect(screen.getByRole("button", { name: "Retour" })).toBeInTheDocument();
  });

  it("uses router.back when there is history", () => {
    setHistoryLength(2);
    render(<PageBack />);
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(back).toHaveBeenCalled();
  });

  it("falls back to push when history is shallow", () => {
    setHistoryLength(1);
    render(<PageBack fallbackHref="/fallback" />);
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(push).toHaveBeenCalledWith("/fallback");
  });
});
