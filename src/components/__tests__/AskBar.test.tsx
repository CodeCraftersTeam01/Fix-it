import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AskBar } from "../AskBar";

describe("AskBar", () => {
  it("submits message when user types and submits form", () => {
    const handleSend = vi.fn();
    render(<AskBar onSendMessage={handleSend} placeholder="Ask FixIt" />);
    
    const input = screen.getByPlaceholderText("Ask FixIt");
    fireEvent.change(input, { target: { value: "Bagaimana cara fixnya?" } });
    
    const submitBtn = screen.getByTitle("Kirim");
    fireEvent.click(submitBtn);

    expect(handleSend).toHaveBeenCalledWith("Bagaimana cara fixnya?");
  });

  it("does not submit empty message", () => {
    const handleSend = vi.fn();
    render(<AskBar onSendMessage={handleSend} />);
    
    const form = screen.getByTitle("Gunakan Suara").closest("form")!;
    fireEvent.submit(form);

    expect(handleSend).not.toHaveBeenCalled();
  });

  it("submits message on Enter keypress", () => {
    const handleSend = vi.fn();
    render(<AskBar onSendMessage={handleSend} placeholder="Ask FixIt" />);
    
    const input = screen.getByPlaceholderText("Ask FixIt");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(handleSend).toHaveBeenCalledWith("hello");
  });

  it("triggers onActionClick when plus button is clicked", () => {
    const handleSend = vi.fn();
    const handleAction = vi.fn();
    render(<AskBar onSendMessage={handleSend} onActionClick={handleAction} />);
    
    const actionBtn = screen.getByTitle("Tangkapan Layar / Opsi");
    fireEvent.click(actionBtn);

    expect(handleAction).toHaveBeenCalled();
  });
});
