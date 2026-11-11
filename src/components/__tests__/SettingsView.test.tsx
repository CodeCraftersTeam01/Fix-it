import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsView } from "../settings/SettingsView";

describe("SettingsView", () => {
  it("renders navbar tabs correctly", () => {
    render(<SettingsView />);
    expect(screen.getAllByText("Model & Provider").length).toBeGreaterThan(0);
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

  it("renders add custom provider modal without default model input", () => {
    render(<SettingsView />);
    const addBtn = screen.getByText("+ Tambah");
    fireEvent.click(addBtn);

    expect(screen.getByText("TAMBAH CUSTOM PROVIDER")).toBeTruthy();
    expect(screen.getByText("NAMA PROVIDER")).toBeTruthy();
    expect(screen.getByText("BASE URL ENDPOINT")).toBeTruthy();
    // DEFAULT MODEL ID input must NOT exist
    expect(screen.queryByText("DEFAULT MODEL ID")).toBeNull();
  });

  it("deletes a custom provider after user confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SettingsView />);
    expect(screen.getByText("Ciora")).toBeTruthy();

    const deleteBtn = screen.getByTitle("Hapus Ciora");
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(screen.queryByText("Ciora")).toBeNull();
  });
});
