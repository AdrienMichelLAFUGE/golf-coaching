import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminGuard from "./admin-guard";

const mockUseProfile = jest.fn();
const mockIsAdminEmail = jest.fn();
const mockGetSession = jest.fn();

jest.mock("./profile-context", () => ({
  useProfile: () => mockUseProfile(),
}));

jest.mock("@/lib/admin", () => ({
  isAdminEmail: (email: string) => mockIsAdminEmail(email),
}));

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

describe("AdminGuard", () => {
  beforeEach(() => {
    mockUseProfile.mockReset();
    mockIsAdminEmail.mockReset();
    mockGetSession.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn();
  });

  it("renders loading state while profile is loading", () => {
    mockUseProfile.mockReturnValue({ userEmail: null, loading: true });
    render(
      <AdminGuard>
        <p>Secret</p>
      </AdminGuard>
    );
    expect(screen.getByText(/Chargement des droits/i)).toBeInTheDocument();
  });

  it("renders children for admin users when backoffice lock is disabled", async () => {
    mockUseProfile.mockReturnValue({ userEmail: "admin@test.com", loading: false });
    mockIsAdminEmail.mockReturnValue(true);
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false, unlocked: true, username: null }),
    });

    render(
      <AdminGuard>
        <p>Secret</p>
      </AdminGuard>
    );

    await waitFor(() => {
      expect(screen.getByText("Secret")).toBeInTheDocument();
    });
  });

  it("shows unlock form when backoffice lock is enabled and locked", async () => {
    mockUseProfile.mockReturnValue({ userEmail: "admin@test.com", loading: false });
    mockIsAdminEmail.mockReturnValue(true);
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, unlocked: false, username: null }),
    });

    render(
      <AdminGuard>
        <p>Secret</p>
      </AdminGuard>
    );

    await waitFor(() => {
      expect(screen.getByText(/Debloquer l acces administrateur/i)).toBeInTheDocument();
    });
  });

  it("unlocks admin view after successful unlock submit", async () => {
    mockUseProfile.mockReturnValue({ userEmail: "admin@test.com", loading: false });
    mockIsAdminEmail.mockReturnValue(true);
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "token" } },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enabled: true, unlocked: false, username: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

    render(
      <AdminGuard>
        <p>Secret</p>
      </AdminGuard>
    );

    await waitFor(() => {
      expect(screen.getByText(/Debloquer l acces administrateur/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Identifiant/i), {
      target: { value: "backup-admin" },
    });
    fireEvent.change(screen.getByLabelText(/Mot de passe backoffice/i), {
      target: { value: "strong-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Debloquer le backoffice/i }));

    await waitFor(() => {
      expect(screen.getByText("Secret")).toBeInTheDocument();
    });
  });
});

