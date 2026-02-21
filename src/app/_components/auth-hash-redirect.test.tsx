import { render, waitFor } from "@testing-library/react";
import AuthHashRedirect from "./auth-hash-redirect";

const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

describe("AuthHashRedirect", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    window.history.pushState({}, "", "/");
  });

  it("does nothing when the hash is not a Supabase auth hash", async () => {
    window.history.pushState({}, "", "/#section");

    render(<AuthHashRedirect />);

    await waitFor(() => {
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("routes legacy email-change hash to /auth/email-change", async () => {
    const legacyMessage = "Confirmation link accepted. Please proceed to confirm link sent to the other email";
    const hash = `#message=${encodeURIComponent(legacyMessage)}&sb=1`;
    window.history.pushState({}, "", `/${hash}`);

    render(<AuthHashRedirect />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
      const target = replaceMock.mock.calls[0]?.[0] as string;
      expect(target.startsWith("/auth/email-change?")).toBe(true);
      const query = target.split("?")[1] ?? "";
      const params = new URLSearchParams(query);
      expect(params.get("source")).toBe("unknown");
      expect(params.get("legacyMessage")).toBe(legacyMessage);
    });
  });

  it("routes non-legacy Supabase hash to /auth/callback with hash preserved", async () => {
    const hash = "#access_token=abc123&refresh_token=ref456&type=magiclink&message=ok";
    window.history.pushState({}, "", `/${hash}`);

    render(<AuthHashRedirect />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledTimes(1);
      const target = replaceMock.mock.calls[0]?.[0] as string;
      expect(target.startsWith("/auth/callback?message=ok#")).toBe(true);
      expect(target).toContain("access_token=abc123");
      expect(target).toContain("refresh_token=ref456");
    });
  });
});
