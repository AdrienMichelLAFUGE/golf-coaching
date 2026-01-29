import { render, screen } from "@testing-library/react";
import AdminGuard from "./admin-guard";

const mockUseProfile = jest.fn();
const mockIsAdminEmail = jest.fn();

jest.mock("./profile-context", () => ({
  useProfile: () => mockUseProfile(),
}));

jest.mock("@/lib/admin", () => ({
  isAdminEmail: (email: string) => mockIsAdminEmail(email),
}));

describe("AdminGuard", () => {
  beforeEach(() => {
    mockUseProfile.mockReset();
    mockIsAdminEmail.mockReset();
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

  it("renders children for admin users", () => {
    mockUseProfile.mockReturnValue({ userEmail: "admin@test.com", loading: false });
    mockIsAdminEmail.mockReturnValue(true);
    render(
      <AdminGuard>
        <p>Secret</p>
      </AdminGuard>
    );
    expect(screen.getByText("Secret")).toBeInTheDocument();
  });
});
