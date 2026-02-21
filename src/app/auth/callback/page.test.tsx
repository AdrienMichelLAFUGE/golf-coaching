import { render, screen, waitFor } from "@testing-library/react";
import AuthCallbackPage from "./page";

const replaceMock = jest.fn();
const exchangeCodeForSessionMock = jest.fn();
const getSessionMock = jest.fn();
const signOutMock = jest.fn();
const resolvePostLoginPathMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSessionMock(...args),
      getSession: (...args: unknown[]) => getSessionMock(...args),
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
  },
}));

jest.mock("@/lib/auth/post-login-path", () => ({
  resolvePostLoginPath: (...args: unknown[]) => resolvePostLoginPathMock(...args),
}));

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    exchangeCodeForSessionMock.mockReset();
    getSessionMock.mockReset();
    signOutMock.mockReset();
    resolvePostLoginPathMock.mockReset();
    global.fetch = jest.fn(async () =>
      Response.json({ role: "coach" }, { status: 200 })
    ) as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("shows explicit sign-in message when provider asks to proceed to sign in", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    getSessionMock.mockResolvedValue({ data: { session: null } });
    window.history.pushState(
      {},
      "",
      "/auth/callback?message=Please%20proceed%20to%20sign%20in"
    );

    render(<AuthCallbackPage />);

    expect(
      await screen.findByText("Email confirme. Tu peux maintenant te connecter.")
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects to email-change with source=new when clicked email is the pending new email", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "token-1",
          user: {
            email: "old@example.com",
            new_email: "new@example.com",
          },
        },
      },
    });

    window.history.pushState(
      {},
      "",
      "/auth/callback?flow=email-change&next=/auth/email-change&email=new@example.com&oldEmail=old@example.com&newEmail=new@example.com"
    );

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
      const target = replaceMock.mock.calls[0]?.[0] as string;
      expect(target.startsWith("/auth/email-change?")).toBe(true);
      expect(target).toContain("source=new");
      expect(target).toContain("oldEmail=old%40example.com");
      expect(target).toContain("newEmail=new%40example.com");
    });
  });
});
