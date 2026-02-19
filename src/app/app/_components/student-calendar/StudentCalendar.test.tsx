import { render, screen } from "@testing-library/react";
import type { HTMLAttributes, ReactNode } from "react";
import StudentCalendar from "./StudentCalendar";

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get: () =>
        ({
          children,
          ...props
        }: HTMLAttributes<HTMLElement> & Record<string, unknown>) => {
          const domProps = { ...props };
          delete domProps.whileTap;
          delete domProps.whileHover;
          delete domProps.initial;
          delete domProps.animate;
          delete domProps.exit;
          delete domProps.transition;
          delete domProps.layout;
          return <div {...domProps}>{children}</div>;
        },
    }
  ),
  useReducedMotion: () => true,
}));

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "token-parent" } },
      })),
    },
  },
}));

describe("StudentCalendar parent mode", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () =>
      Response.json({ events: [] }, { status: 200 })
    ) as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("renders add action disabled with parent read-only tooltip", async () => {
    render(
      <StudentCalendar
        studentId="11111111-1111-1111-1111-111111111111"
        mode="parent"
        locale="fr-FR"
      />
    );

    const addButtons = await screen.findAllByRole("button", {
      name: "Ajouter un evenement",
    });
    expect(addButtons.length).toBeGreaterThan(0);
    addButtons.forEach((button) => {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "Lecture seule (parent)");
    });
  });
});
