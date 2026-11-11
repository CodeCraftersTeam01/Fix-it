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
    // Ciora is displayed in provider cards and active engine pill
    expect(screen.getAllByText("Ciora").length).toBeGreaterThan(0);
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
    expect(screen.getAllByText("Ciora").length).toBeGreaterThan(0);

    const deleteBtn = screen.getByTitle("Hapus Ciora");
    fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
  });

  it("renders global active model selector banner", () => {
    render(<SettingsView />);
    expect(screen.getByText("MODEL AKTIF UTAMA FIXIT")).toBeTruthy();
    expect(screen.getByText(/Active Engine/i)).toBeTruthy();
  });

  it("displays offline indicator for providers without connections", () => {
    const customConfig = {
      openai_base_url: "https://api.test.com/v1",
      openai_api_key: "",
      model_name: "test-model",
      idle_delay_ms: 2000,
      watched_paths: [],
      active_provider: "offline-p",
      custom_providers: [
        {
          id: "offline-p",
          name: "Offline Provider",
          protocol: "openai" as const,
          base_url: "https://offline.test/v1",
          api_keys: [],
          active_model: "off-m",
          available_models: [{ id: "off-m", name: "off-m" }],
        },
      ],
    };
    render(<SettingsView config={customConfig} />);
    expect(screen.getAllByText(/Offline/i).length).toBeGreaterThan(0);
  });
});
