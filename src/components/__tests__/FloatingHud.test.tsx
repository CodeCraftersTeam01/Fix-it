import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingHud } from "../FloatingHud";

describe("FloatingHud standby reset", () => {
  const dummyError = {
    file_path: "index.php",
    line_number: 3,
    error_type: "ParseError",
    raw_message: "syntax error, unexpected token",
    project_name: "FixIt",
  };

  const dummyExplanation = {
    summary: "Statement echo belum diakhiri titik koma",
    why_it_happened: "PHP butuh titik koma",
    steps: ["Tambahkan titik koma"],
    code_hint: "echo 'hello';",
  };

  it("calls onClearError when closing/silang HUD while error is active", () => {
    const onClearError = vi.fn();
    const onClose = vi.fn();

    render(
      <FloatingHud
        currentError={dummyError}
        explanation={dummyExplanation}
        messages={[]}
        onSendMessage={vi.fn()}
        onClose={onClose}
        onClearError={onClearError}
      />
    );

    // Click close button in header
    const closeBtn = screen.getByLabelText("Close");
    fireEvent.click(closeBtn);

    expect(onClearError).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClearError when clicking Kembali standby button", () => {
    const onClearError = vi.fn();

    render(
      <FloatingHud
        currentError={dummyError}
        explanation={dummyExplanation}
        messages={[]}
        onSendMessage={vi.fn()}
        onClose={vi.fn()}
        onClearError={onClearError}
      />
    );

    const standbyBtn = screen.getByTitle("Tutup error dan kembali ke mode standby");
    fireEvent.click(standbyBtn);

    expect(onClearError).toHaveBeenCalledTimes(1);
  });
});
