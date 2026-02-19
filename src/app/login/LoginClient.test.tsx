import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const waitForSessionCheckToFinish = async () => {
    await waitFor(() => {
      expect(screen.queryByText("Verification de la session...")).not.toBeInTheDocument();
    });
  };

  beforeEach(() => {
    replaceMock.mockReset();
  });

  it("shows parent account option and signup link", async () => {
    render(
      <LoginClient
        resetSuccess={false}
        nextPath={null}
        initialCoachFlow={null}
        initialAccountType={null}
      />
    );
    await waitForSessionCheckToFinish();

    fireEvent.click(screen.getByRole("button", { name: /Parent/i }));

    expect(
      await screen.findByRole("button", { name: "Connexion parent" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Creer un compte parent" })
    ).toHaveAttribute("href", "/signup/parent");
  });

  it("shows role selection step before form when required", async () => {
    render(
      <LoginClient
        resetSuccess={false}
        nextPath={null}
        initialCoachFlow={null}
        initialAccountType={null}
        requireRoleSelection
      />
    );
    await waitForSessionCheckToFinish();

    expect(
      screen.getByText("Choisis d abord ton profil pour acceder au bon espace.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Parent/i }));

    expect(replaceMock).toHaveBeenCalledWith("/login/parent");
  });
});
