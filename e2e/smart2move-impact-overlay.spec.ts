import { expect, test } from "@playwright/test";

test("smart2move overlay: Transition -> Impact se termine sur la ligne impact", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/e2e/smart2move-impact");

  const overlay = page.getByTestId("s2m-overlay-preview");
  await expect(overlay).toBeVisible();
  await expect(page.getByText("Impact analyse (IA)")).toBeVisible();

  const impactMarker = page.getByTestId("s2m-impact-marker");
  const transitionZone = page.getByTestId("s2m-zone-transition_impact");
  const peakWindow = page.getByTestId("s2m-peak-window");
  await expect(impactMarker).toBeVisible();
  await expect(transitionZone).toBeVisible();
  await expect(peakWindow).toBeHidden();
  await page.getByTestId("s2m-zone-peak_intensity_timing").click();
  await expect(peakWindow).toBeVisible();

  const overlayBox = await overlay.boundingBox();
  const markerBox = await impactMarker.boundingBox();
  const zoneBox = await transitionZone.boundingBox();
  const peakWindowBox = await peakWindow.boundingBox();
  expect(overlayBox).not.toBeNull();
  expect(markerBox).not.toBeNull();
  expect(zoneBox).not.toBeNull();
  expect(peakWindowBox).not.toBeNull();
  if (!overlayBox || !markerBox || !zoneBox || !peakWindowBox) {
    throw new Error("Overlay geometry unavailable.");
  }

  const markerX = markerBox.x;
  const markerRatio = (markerX - overlayBox.x) / overlayBox.width;
  const transitionZoneEnd = zoneBox.x + zoneBox.width;

  expect(markerRatio).toBeGreaterThanOrEqual(0.7);
  expect(markerRatio).toBeLessThanOrEqual(0.74);

  const deltaPixels = Math.abs(transitionZoneEnd - markerX);
  expect(deltaPixels).toBeLessThanOrEqual(1.5);

  const peakWindowStart = peakWindowBox.x;
  const peakWindowEnd = peakWindowBox.x + peakWindowBox.width;
  expect(peakWindowStart).toBeLessThan(markerX);
  expect(peakWindowEnd).toBeGreaterThan(markerX);

  const previewPath = test.info().outputPath("smart2move-impact-overlay-preview.png");
  await overlay.screenshot({ path: previewPath });
  await test.info().attach("smart2move-impact-overlay-preview", {
    path: previewPath,
    contentType: "image/png",
  });
});
