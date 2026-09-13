import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import { fileURLToPath } from "node:url";

let browser: Browser;
let page: Page;
let bundle: string;
beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "tsx",
      contents: `
        import React, { useRef, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
        import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './components/ui/select';
        import { useDialogFocus } from './hooks/use-dialog-focus';
        function Fixture() {
          const [selected, setSelected] = useState('all');
          const [open, setOpen] = useState(false);
          const dialog = useRef(null);
          useDialogFocus(dialog, open);
          return <>
            <Tabs defaultValue="overview">
              <TabsList aria-label="Review views">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="disabled" disabled>Unavailable</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">Overview content</TabsContent>
              <TabsContent value="history">History content</TabsContent>
            </Tabs>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger aria-label="Filter status"><SelectValue placeholder="Choose status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="disabled" disabled>Unavailable status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <output aria-label="Selected status">{selected}</output>
            <Select defaultValue="one"><SelectTrigger aria-label="Uncontrolled select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="one">One</SelectItem><SelectItem value="two">Two</SelectItem></SelectContent></Select>
            <button onClick={() => setOpen(true)}>Open dialog</button>
            {open && <section ref={dialog} role="dialog" aria-modal="true" aria-label="Search" onKeyDown={e => { if(e.key === 'Escape') setOpen(false); }}>
              <input role="combobox" aria-label="Search workspace" />
              <button onClick={() => setOpen(false)}>Close dialog</button>
            </section>}
          </>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);
      `,
    }, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  });
  bundle = result.outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 30000);
beforeEach(async () => {
  await page?.close();
  page = await browser.newPage();
  await page.setContent('<html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: bundle });
  await page.getByRole("tab", { name: "Overview", exact: true }).waitFor();
});
afterAll(async () => { await browser?.close(); });

describe("workspace keyboard interactions", () => {
  it("moves between tabs with arrows, skips disabled tabs and connects the active panel", async () => {
    const overview = page.getByRole("tab", { name: "Overview", exact: true });
    await overview.focus();
    await page.keyboard.press("ArrowRight");
    const history = page.getByRole("tab", { name: "History", exact: true });
    expect(await history.getAttribute("aria-selected")).toBe("true");
    expect(await page.getByRole("tabpanel").textContent()).toBe("History content");
    expect(await page.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(await history.getAttribute("id"));
    await page.keyboard.press("Home");
    expect(await overview.getAttribute("aria-selected")).toBe("true");
  });
  it("opens a select, skips disabled options and updates the controlled label and value", async () => {
    const trigger = page.getByRole("button", { name: "Filter status", exact: true });
    await trigger.focus(); await page.keyboard.press("ArrowDown");
    await page.getByRole("listbox").waitFor();
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    expect(await page.getByLabel("Selected status").textContent()).toBe("open");
    expect(await trigger.textContent()).toBe("Open");
    expect(await trigger.getAttribute("aria-expanded")).toBe("false");
    expect(await trigger.evaluate(element => element === document.activeElement)).toBe(true);
  });
  it("dismisses a select with Escape without changing its value", async () => {
    const trigger = page.getByRole("button", { name: "Filter status", exact: true });
    await trigger.click(); await page.keyboard.press("End"); await page.keyboard.press("Escape");
    expect(await page.getByRole("listbox").count()).toBe(0);
    expect(await trigger.textContent()).toBe("All statuses");
    expect(await trigger.evaluate(element => element === document.activeElement)).toBe(true);
  });
  it("supports selection without a controlled value", async () => {
    const trigger = page.getByRole("button", { name: "Uncontrolled select", exact: true });
    await trigger.click(); await page.getByRole("option", { name: "Two", exact: true }).click();
    expect(await trigger.textContent()).toBe("Two");
  });
  it("contains focus in the dialog and restores the opener after Escape", async () => {
    const opener = page.getByRole("button", { name: "Open dialog", exact: true });
    await opener.click();
    const search = page.getByRole("combobox");
    expect(await search.evaluate(element => element === document.activeElement)).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await page.getByRole("button", { name: "Close dialog" }).evaluate(element => element === document.activeElement)).toBe(true);
    await page.keyboard.press("Tab");
    expect(await search.evaluate(element => element === document.activeElement)).toBe(true);
    await page.keyboard.press("Escape");
    expect(await opener.evaluate(element => element === document.activeElement)).toBe(true);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });
});
