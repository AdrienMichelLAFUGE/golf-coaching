import { render, screen } from "@testing-library/react";
import ParentHomePage from "./page";

const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
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

describe("/parent", () => {
  beforeEach(() => {
    const mockedClient = jest.requireMock("@/lib/supabase/client") as {
      supabase: {
        auth: {
          getSession: jest.Mock;
        };
      };
    };
    mockedClient.supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "token-parent" } },
    });
    replaceMock.mockReset();
    global.fetch = jest.fn(async () =>
      Response.json({ children: [] }, { status: 200 })
    ) as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("shows onboarding CTA when no child is linked", async () => {
    render(<ParentHomePage />);

    await screen.findByText("Aucun enfant rattache. Redirection vers l acceptation d invitation...");
    expect(
      screen.getAllByRole("link", { name: "Accepter une invitation" })
    ).toHaveLength(2);
    expect(replaceMock).toHaveBeenCalledWith("/parent/invitations/accept");
  });

  it("keeps add-child CTA visible when parent already has linked children", async () => {
    global.fetch = jest.fn(async () =>
      Response.json(
        {
          children: [
            {
              id: "student-1",
              firstName: "Leo",
              lastName: "Martin",
              fullName: "Leo Martin",
              email: "leo@example.com",
            },
          ],
        },
        { status: 200 }
      )
    ) as jest.Mock;

    render(<ParentHomePage />);

    await screen.findByText("Leo Martin");
    expect(
      screen.getByRole("link", { name: "Accepter une invitation" })
    ).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
