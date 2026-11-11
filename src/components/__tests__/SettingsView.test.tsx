import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsView } from "../settings/SettingsView";

describe("SettingsView", () => {
  it("renders navbar tabs correctly", () => {
    render(<SettingsView />);
    expect(screen.getByText("Model & Provider")).toBeTruthy();
    expect(screen.getByText("Folder Pantauan")).toBeTruthy();
    expect(screen.getByText("Pengaturan Umum")).toBeTruthy();
    expect(screen.getByText("Tentang FixIt")).toBeTruthy();
  });

  it("renders default providers and custom providers", () => {
    render(<SettingsView />);
    // Initial view has Ciora selected by default
    expect(screen.getByText("Ciora")).toBeTruthy();
    expect(screen.getAllByText(/OPENAI COMPATIBLE/i).length).toBeGreaterThan(0);
  });

  it("allows switching tabs to Folder Pantauan", () => {
    render(<SettingsView />);
    const folderTab = screen.getByText("Folder Pantauan");
    fireEvent.click(folderTab);
    expect(screen.getByText(/Folder Proyek yang Dipantau/i)).toBeTruthy();
  });

  it("calls onClose when close button clicked", () => {
    const handleClose = vi.fn();
    render(<SettingsView onClose={handleClose} />);
    const closeBtn = screen.getByLabelText("Tutup Pengaturan");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
