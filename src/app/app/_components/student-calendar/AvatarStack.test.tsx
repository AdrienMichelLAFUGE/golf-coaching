import { render, screen } from "@testing-library/react";
import AvatarStack from "./AvatarStack";

describe("AvatarStack", () => {
  it("renders image avatar when url exists", () => {
    render(
      <AvatarStack
        participants={[
          {
            studentId: "11111111-1111-1111-1111-111111111111",
            name: "Alice Martin",
            avatarUrl: "https://cdn.test/alice.png",
          },
        ]}
      />
    );

    const avatar = screen.getByAltText("Alice Martin") as HTMLImageElement;
    expect(avatar).toBeInTheDocument();
    expect(avatar.src).toContain("https://cdn.test/alice.png");
  });

  it("renders initials fallback when avatar url is missing", () => {
    render(
      <AvatarStack
        participants={[
          {
            studentId: "22222222-2222-2222-2222-222222222222",
            name: "Benoit Durand",
            avatarUrl: null,
          },
        ]}
      />
    );

    expect(screen.getByText("BD")).toBeInTheDocument();
  });
});

