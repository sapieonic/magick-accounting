import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReceiptDropzone from "@/components/ui/ReceiptDropzone";

function makeFile(name = "receipt.png", type = "image/png") {
  return new File(["data"], name, { type });
}

describe("ReceiptDropzone", () => {
  it("calls onFile when a file is selected via the input", async () => {
    const onFile = vi.fn();
    const user = userEvent.setup();
    render(<ReceiptDropzone onFile={onFile} />);

    const file = makeFile();
    await user.upload(screen.getByLabelText("Upload receipt"), file);
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("calls onFile when a file is dropped", () => {
    const onFile = vi.fn();
    render(<ReceiptDropzone onFile={onFile} />);

    const file = makeFile();
    fireEvent.drop(screen.getByTestId("receipt-dropzone"), {
      dataTransfer: { files: [file] },
    });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("ignores drops when disabled", () => {
    const onFile = vi.fn();
    render(<ReceiptDropzone onFile={onFile} disabled />);

    fireEvent.drop(screen.getByTestId("receipt-dropzone"), {
      dataTransfer: { files: [makeFile()] },
    });
    expect(onFile).not.toHaveBeenCalled();
  });

  it("calls onFile for pasted files when acceptPaste is set", () => {
    const onFile = vi.fn();
    render(<ReceiptDropzone onFile={onFile} acceptPaste />);

    const file = makeFile();
    fireEvent.paste(document, { clipboardData: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("does not listen for paste by default", () => {
    const onFile = vi.fn();
    render(<ReceiptDropzone onFile={onFile} />);

    fireEvent.paste(document, { clipboardData: { files: [makeFile()] } });
    expect(onFile).not.toHaveBeenCalled();
  });

  it("renders custom children instead of the default hint", () => {
    render(
      <ReceiptDropzone onFile={() => {}}>
        <span>Custom content</span>
      </ReceiptDropzone>
    );
    expect(screen.getByText("Custom content")).toBeInTheDocument();
    expect(screen.queryByText(/drag & drop/i)).not.toBeInTheDocument();
  });
});
