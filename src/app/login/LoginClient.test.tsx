import { fireEvent, render, screen } from "@testing-library/react";
import LoginClient from "./LoginClient";

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: null },
      })),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
}));

jest.mock("@/lib/auth/session-recovery", () => ({
  waitForRecoveredSession: jest.fn(async () => null),
}));

const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

describe("LoginClient parent option", () => {
  beforeEach(() => {
    replaceMock.mockReset();
  });

  it("shows parent account option and signup link", async () => {
    render(
      <LoginClient resetSuccess={false} nextPath={null} initialCoachFlow={null} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Parent" }));

    expect(
      await screen.findByRole("button", { name: "Connexion parent" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Creer un compte parent" })
    ).toHaveAttribute("href", "/signup/parent");
  });
});
