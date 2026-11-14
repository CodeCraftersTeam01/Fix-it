import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HeaderBar } from "../HeaderBar";

describe("HeaderBar", () => {
  it("renders custom greeting correctly when passed", () => {
    render(<HeaderBar greeting="Hello FixIt" />);
    expect(screen.getByText("Hello FixIt")).toBeTruthy();
  });

  it("calls onClose when close button clicked", () => {
    const handleClose = vi.fn();
    render(<HeaderBar onClose={handleClose} />);
    const closeBtn = screen.getByLabelText("Close");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onExpand when expand button clicked", () => {
    const handleExpand = vi.fn();
    render(<HeaderBar onExpand={handleExpand} />);
    const expandBtn = screen.getByLabelText("Expand");
    fireEvent.click(expandBtn);
    expect(handleExpand).toHaveBeenCalledTimes(1);
  });

  it("calls onCapture when capture button clicked", () => {
    const handleCapture = vi.fn();
    render(<HeaderBar onCapture={handleCapture} />);
    const captureBtn = screen.getByLabelText("Capture Screen");
    fireEvent.click(captureBtn);
    expect(handleCapture).toHaveBeenCalledTimes(1);
  });
});
