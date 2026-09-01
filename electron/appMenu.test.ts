import { expect, test, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: {},
  Menu: {}
}));

import { createApplicationMenuTemplate } from "./appMenu";

test("places Settings in the Edit menu and invokes the renderer callback", () => {
  const openSettings = vi.fn();
  const template = createApplicationMenuTemplate(openSettings);
  const editMenu = template.find((item) => item.label === "Edit");
  const submenu = editMenu?.submenu as Array<{
    accelerator?: string;
    click?: () => void;
    label?: string;
  }>;
  const settingsItem = submenu.find((item) => item.label === "Settings…");

  expect(settingsItem).toMatchObject({ accelerator: "Ctrl+," });
  settingsItem?.click?.();
  expect(openSettings).toHaveBeenCalledOnce();
});
