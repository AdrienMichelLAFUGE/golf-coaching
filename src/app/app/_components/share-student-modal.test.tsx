import { fireEvent, render, screen } from "@testing-library/react";
import ShareStudentModal from "./share-student-modal";

describe("ShareStudentModal", () => {
  it("opens and validates email", async () => {
    const onShare = jest.fn(async () => ({}));
    const onClose = jest.fn();

    render(<ShareStudentModal onClose={onClose} onShare={onShare} />);

    expect(screen.getByText("Inviter un coach en lecture seule")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("coach@email.com");
    fireEvent.change(input, { target: { value: "not-an-email" } });

    const form = screen.getByText("Envoyer").closest("form");
    if (!form) {
      throw new Error("Form not found");
    }
    fireEvent.submit(form);

    expect(await screen.findByText("Email invalide.")).toBeInTheDocument();
    expect(onShare).not.toHaveBeenCalled();
  });
});
