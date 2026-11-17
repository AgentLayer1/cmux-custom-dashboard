import { expect, test } from "bun:test";
import { crop, decodePng, encodePng, panelRect, type Image } from "./png.ts";
import { shotSteps } from "./screenshot.ts";

// A made-up window: a terminal on the left, the panel on the right with a mode bar across its top.
const madeUpShot = (): Image => {
  const [width, height] = [400, 300];
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = x < 300 ? [47, 47, 55] : y < 20 ? [60, 60, 70] : [34, 34, 39];
      pixels.set([...color, 255], (y * width + x) * 4);
    }
  }
  return { width, height, pixels };
};

test("a PNG survives being written and read back", () => {
  const image = madeUpShot();
  expect(decodePng(encodePng(image))).toEqual(image);
});

test("the panel starts at its edge, below the mode bar, and stops above the window's corner", () => {
  const image = madeUpShot();
  const rect = panelRect(image);
  expect(rect).toEqual({ x: 300, y: 20, width: 100, height: 300 - 20 - 32 });
  const panel = crop(image, rect);
  expect([...panel.pixels.subarray(0, 4)]).toEqual([34, 34, 39, 255]);
});

test("a shot with no clear panel edge is refused, not cropped somewhere", () => {
  const flat: Image = { width: 50, height: 50, pixels: new Uint8Array(50 * 50 * 4).fill(40) };
  expect(() => panelRect(flat)).toThrow("no panel edge found");
});

test("every step after opening the window names that window", () => {
  const steps = shotSteps("window-under-test", "manager-preview", "/tmp/full.png");
  expect(steps.every(({ args }) => args[args.indexOf("--window") + 1] === "window-under-test")).toBe(true);
});
