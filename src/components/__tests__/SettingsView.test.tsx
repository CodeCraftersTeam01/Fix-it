import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("dynamically shows connection count matching api_keys length", () => {
    const customConfig = {
      openai_base_url: "https://api.test.com/v1",
      openai_api_key: "",
      model_name: "test-m",
      idle_delay_ms: 2000,
      watched_paths: [],
      active_provider: "dynamic-p",
      custom_providers: [
        {
          id: "dynamic-p",
          name: "Dynamic Provider",
          protocol: "openai" as const,
          base_url: "https://dynamic.test/v1",
          api_keys: ["key-1", "key-2", "key-3"],
          active_model: "test-m",
          available_models: [{ id: "test-m", name: "test-m" }],
        },
      ],
    };
    render(<SettingsView config={customConfig} />);
    expect(screen.getByText("3 Connected")).toBeTruthy();
  });

  it("allows deleting custom models inside a provider", () => {
    const onSave = vi.fn();
    const customConfig = {
      openai_base_url: "https://api.test.com/v1",
      openai_api_key: "",
      model_name: "model-1",
      idle_delay_ms: 2000,
      watched_paths: [],
      active_provider: "edit-p",
      custom_providers: [
        {
          id: "edit-p",
          name: "Editable Provider",
          protocol: "openai" as const,
          base_url: "https://edit.test/v1",
          api_keys: ["key-1"],
          active_model: "model-1",
          available_models: [
            { id: "model-1", name: "model-1" },
            { id: "model-2", name: "model-2" },
          ],
        },
      ],
    };
    render(<SettingsView config={customConfig} onSave={onSave} />);

    // Click on Editable Provider to view detail
    const providerCards = screen.getAllByText("Editable Provider");
    fireEvent.click(providerCards[providerCards.length - 1]);

    // Both models should be visible in detail view
    expect(screen.getAllByText("model-1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("model-2").length).toBeGreaterThan(0);

    // Click trash button on model-2
    const deleteButtons = screen.getAllByTitle("Hapus Model");
    expect(deleteButtons.length).toBe(2);
    fireEvent.click(deleteButtons[1]);

    // onSave should be called with remaining model-1 only
    expect(onSave).toHaveBeenCalled();
    const savedConfig = onSave.mock.calls[onSave.mock.calls.length - 1][0];
    const editableP = savedConfig.custom_providers.find((p: { id: string }) => p.id === "edit-p");
    expect(editableP.available_models).toHaveLength(1);
    expect(editableP.available_models[0].id).toBe("model-1");
  });

  it("renders launch at login toggle in general settings and allows toggling", async () => {
    render(<SettingsView />);
    const generalTab = screen.getByText("Pengaturan Umum");
    fireEvent.click(generalTab);

    expect(screen.getByText("Launch at Login (Mulai Otomatis)")).toBeTruthy();
    expect(screen.getByText(/Nonaktif \(Manual\)/i)).toBeTruthy();

    const toggleBtn = screen.getByLabelText("Toggle Launch at Login");
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByText(/Aktif \(Auto-start saat login sistem\)/i)).toBeTruthy();
    });
  });

  it("handles ping error gracefully when key is empty or invalid", async () => {
    render(<SettingsView />);
    const providerCards = screen.getAllByText("OpenAI");
    fireEvent.click(providerCards[providerCards.length - 1]);

    const pingButtons = screen.getAllByText("PING");
    expect(pingButtons.length).toBeGreaterThan(0);
    fireEvent.click(pingButtons[0]);

    await waitFor(() => {
      const status = screen.queryByText(/Key belum diisi|401|Gagal/i);
      expect(status).toBeTruthy();
    });
  });
});
