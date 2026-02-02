import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
const orgName = process.env.E2E_ORG_NAME;

const hasEnv = Boolean(email) && Boolean(password) && Boolean(orgName);

test("workspace switcher happy path (perso -> org -> perso)", async ({ page }) => {
  test.skip(!hasEnv, "Missing E2E_USER_EMAIL / E2E_USER_PASSWORD / E2E_ORG_NAME.");

  await page.goto("/");

  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Mot de passe").fill(password!);
  await page.locator('form button[type="submit"]').click();

  await page.waitForURL("**/app");
  await expect(
    page.getByTestId("workspace-personal-panel").getByText("Workspace personnel", {
      exact: true,
    })
  ).toBeVisible();
  await expect(page.getByTestId("workspace-switcher-button")).toContainText(
    "MODE PERSO"
  );

  await page.getByTestId("workspace-switcher-button").click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page
    .getByRole("menuitem", { name: new RegExp(orgName!, "i") })
    .click();

  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("workspace-switcher-button")).toContainText(
    "MODE ORGANISATION"
  );
  await expect(
    page.getByTestId("workspace-org-panel").getByText(orgName!)
  ).toBeVisible();
  await expect(
    page
      .getByTestId("workspace-org-panel")
      .getByRole("button", { name: /workspace actif/i })
  ).toBeVisible();

  await page.getByTestId("workspace-switcher-button").click();
  await expect(page.getByRole("menu")).toBeVisible();
  const personalItem = page.getByTestId("workspace-switcher-personal");
  await expect(personalItem).toBeVisible();
  await personalItem.click();

  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("workspace-switcher-button")).toContainText(
    "MODE PERSO"
  );
  await expect(
    page
      .getByTestId("workspace-personal-panel")
      .getByRole("button", { name: /workspace actif/i })
  ).toBeVisible();
});
