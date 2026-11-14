import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiffViewer } from "../DiffViewer";

describe("DiffViewer", () => {
  it("renders structured diff with line numbers and markers correctly", () => {
    const diffData = {
      type: "diff" as const,
      file: "FloatingHud.tsx",
      add_count: 1,
      del_count: 0,
      lines: [
        { type: "ctx" as const, num: 337, text: "ref={scrollRef}" },
        { type: "add" as const, num: 338, marker: "+", text: "onScroll={handleScroll}" },
        { type: "ctx" as const, num: 339, text: "className=\"flex-1\"" },
      ],
    };

    render(<DiffViewer data={diffData} />);

    expect(screen.getByText("Edited")).toBeDefined();
    expect(screen.getByText("FloatingHud.tsx")).toBeDefined();
    expect(screen.getByText("+1")).toBeDefined();
    expect(screen.getByText("onScroll={handleScroll}")).toBeDefined();
    expect(screen.getByText("+")).toBeDefined();
    expect(screen.getByText("338")).toBeDefined();
  });

  it("handles collapse and expand when header is clicked", () => {
    const diffData = {
      type: "diff" as const,
      file: "example.ts",
      lines: [
        { type: "add" as const, num: 1, marker: "+", text: "const x = 1;" },
      ],
    };

    render(<DiffViewer data={diffData} defaultExpanded={true} />);

    expect(screen.getByText("const x = 1;")).toBeDefined();

    // Click header to collapse
    const header = screen.getByText("example.ts");
    fireEvent.click(header);

    // Code line should not be visible when collapsed
    expect(screen.queryByText("const x = 1;")).toBeNull();
  });
});
