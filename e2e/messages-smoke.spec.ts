import { expect, test } from "@playwright/test";

test("messages smoke: send updates inbox preview and notification badge", async ({ page }) => {
  await page.goto("/e2e/messages-smoke");

  await expect(page.getByTestId("messages-badge")).toHaveText("0");
  await page.getByPlaceholder("Nouveau message").fill("Message smoke");
  await page.getByTestId("messages-send").click();

  await expect(page.getByTestId("messages-thread-message").last()).toContainText("Message smoke");
  await expect(page.getByTestId("messages-inbox-preview")).toContainText("Message smoke");
  await expect(page.getByTestId("messages-badge")).toHaveText("1");
});
