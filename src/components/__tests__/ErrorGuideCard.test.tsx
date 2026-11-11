import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorGuideCard } from "../ErrorGuideCard";
import { CodeError, FixExplanation } from "../../types";

describe("ErrorGuideCard", () => {
  const mockError: CodeError = {
    file_path: "app/Models/User.php",
    line_number: 42,
    error_type: "FatalError",
    raw_message: "Class 'App\\Models\\Post' not found",
    project_name: "Tugas-Akhir",
  };

  const mockExplanation: FixExplanation = {
    summary: "Namespace atau model Post belum di-import.",
    why_it_happened: "PHP tidak menemukan class Post karena namespace belum dimasukkan dengan use.",
    steps: [
      "Tambahkan 'use App\\Models\\Post;' di bagian atas file.",
      "Periksa nama relasi di method posts().",
    ],
    code_hint: "use App\\Models\\Post;",
  };

  it("renders file name, line number, and explanation", () => {
    render(<ErrorGuideCard error={mockError} explanation={mockExplanation} />);
    expect(screen.getByText("User.php")).toBeTruthy();
    expect(screen.getByText("Line 42")).toBeTruthy();
    expect(screen.getByText("Tugas-Akhir")).toBeTruthy();
    expect(screen.getByText("Namespace atau model Post belum di-import.")).toBeTruthy();
  });

  it("toggles checklist items on click", () => {
    render(<ErrorGuideCard error={mockError} explanation={mockExplanation} />);
    const stepButton = screen.getByText("Tambahkan 'use App\\Models\\Post;' di bagian atas file.");
    expect(stepButton).toBeTruthy();
    fireEvent.click(stepButton);
  });
});

