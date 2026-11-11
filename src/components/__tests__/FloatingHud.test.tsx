import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloatingHud } from "../FloatingHud";
import { ActiveErrorItem } from "../../types";

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

  it("renders backend runtime crash error and AI guide in HUD", () => {
    const runtimeError = {
      file_path: "app/Http/Controllers/OrderController.php",
      line_number: 45,
      error_type: "QueryException",
      raw_message: "SQLSTATE[HY000]: General error: 1 no such table: orders",
      snippet: "> 45 | Order::create($request->all());",
      project_name: "TokoOnline",
    };

    const runtimeExplanation = {
      summary: "Tabel database 'orders' belum dibuat atau belum dimigrasi",
      why_it_happened: "Model Order mencoba mengakses tabel yang belum ada.",
      steps: [
        "Jalankan migrasi database: php artisan migrate",
        "Periksa apakah file migrasi tabel orders sudah dibuat.",
      ],
      code_hint: "php artisan migrate",
    };

    render(
      <FloatingHud
        currentError={runtimeError}
        explanation={runtimeExplanation}
        messages={[]}
        onSendMessage={vi.fn()}
        onClose={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(screen.getByText("QueryException")).toBeDefined();
    expect(
      screen.getByText(
        (_, el) =>
          el?.textContent ===
          "Tabel database 'orders' belum dibuat atau belum dimigrasi"
      )
    ).toBeDefined();
  });

  it("renders multiple tabs when activeErrors.length > 1 and clicking switches tab", () => {
    const error1: ActiveErrorItem = {
      id: "app/Http/Controllers/UserController.php",
      error: {
        file_path: "app/Http/Controllers/UserController.php",
        line_number: 12,
        error_type: "ParseError",
        raw_message: "syntax error in UserController",
        project_name: "FixIt",
      },
      explanation: {
        summary: "Syntax error in UserController",
        why_it_happened: "Missing semicolon",
        steps: ["Fix UserController"],
        code_hint: "$x = 1;",
      },
      hit_count: 1,
      is_looping: false,
      timestamp: Date.now(),
    };

    const error2: ActiveErrorItem = {
      id: "app/Models/Order.php",
      error: {
        file_path: "app/Models/Order.php",
        line_number: 40,
        error_type: "FatalError",
        raw_message: "Class not found in Order",
        project_name: "FixIt",
      },
      explanation: {
        summary: "Class Order not found",
        why_it_happened: "Wrong namespace",
        steps: ["Fix Order namespace"],
        code_hint: "use App\\Models\\Order;",
      },
      hit_count: 1,
      is_looping: false,
      timestamp: Date.now(),
    };

    const onSelectError = vi.fn();

    const { rerender } = render(
      <FloatingHud
        activeErrors={[error1, error2]}
        selectedErrorIndex={0}
        onSelectError={onSelectError}
        messages={[]}
        onSendMessage={vi.fn()}
        onClose={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    // Multi-error count header
    expect(screen.getByText(/2 Error Terdeteksi/)).toBeDefined();

    // Tabs rendered
    expect(screen.getAllByText("UserController.php").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Order.php")).toBeDefined();
    expect(screen.getAllByText(/Line 12/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Line 40/)).toBeDefined();

    // Currently showing error1
    expect(
      screen.getByText(
        (_, el) => el?.textContent === "Syntax error in UserController"
      )
    ).toBeDefined();

    // Click tab 2
    fireEvent.click(screen.getByRole("button", { name: /Order\.php/ }));
    expect(onSelectError).toHaveBeenCalledWith(1);

    // If rerendered with selectedErrorIndex = 1
    rerender(
      <FloatingHud
        activeErrors={[error1, error2]}
        selectedErrorIndex={1}
        onSelectError={onSelectError}
        messages={[]}
        onSendMessage={vi.fn()}
        onClose={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(
      screen.getByText(
        (_, el) => el?.textContent === "Class Order not found"
      )
    ).toBeDefined();
  });

  it("renders loop/interval warning badge when is_looping is true", () => {
    const loopingError: ActiveErrorItem = {
      id: "resources/js/polling.js",
      error: {
        file_path: "resources/js/polling.js",
        line_number: 88,
        error_type: "TypeError",
        raw_message: "Cannot read properties of undefined (reading 'data')",
        project_name: "FixIt",
      },
      explanation: {
        summary: "Data undefined dalam interval fetch",
        why_it_happened: "Interval memanggil data sebelum response selesai.",
        steps: ["Cek apakah response sudah ready"],
        code_hint: "if (res && res.data) { ... }",
      },
      hit_count: 14,
      is_looping: true,
      timestamp: Date.now(),
    };

    render(
      <FloatingHud
        activeErrors={[loopingError]}
        selectedErrorIndex={0}
        messages={[]}
        onSendMessage={vi.fn()}
        onClose={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    // Badge should be rendered with hit count
    expect(
      screen.getByText(/Loop \/ setInterval Terdeteksi.*14x/)
    ).toBeDefined();
  });
});
