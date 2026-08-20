/**
 * Standalone tuning page for the paper-and-ink renderer.
 *
 * Imports the same field, paper, ink and wear modules the app will use, so
 * numbers dialled in here transfer directly. Not wired into the app, and not
 * part of the production build.
 */

import "./tune.css";
import { createInkLayer, type InkParams } from "../aura/ink";
import { blitPaper, createPaperLayer, type PaperParams } from "../aura/paper";
import { PaperWear } from "../aura/wear";
import { HUE_NEGATIVE, HUE_POSITIVE } from "../aura/mapping";

const EASING = 0.04;

interface Controls {
  // paper
  crinkle: number;
  grainScale: number;
  // ink
  inkOpacity: number;
  fadeRate: number;
  strokeCount: number;
  jitter: number;
  // sentiment, so the mapping can be judged rather than guessed
  valence: number;
  arousal: number;
  certainty: number;
  confidence: number;
  // stroke behaviour
  lifetime: number;
  penLift: number;
  gestureScale: number;
  followContours: boolean;
  useWear: boolean;
  // Hue ramp anchors. At ink lightness the stock warm anchor (46) reads olive
  // rather than gold; pulling it toward ~25 gives sienna instead.
  hueCold: number;
  hueWarm: number;
  inkLightness: number;
}

const controls: Controls = {
  crinkle: 0.5,
  grainScale: 1,
  inkOpacity: 0.85,
  fadeRate: 0.003,
  strokeCount: 14,
  jitter: 0.12,
  // Mid valence maps to olive in ink (hue ~81); starting warmer so the first
  // look is not the least flattering point on the ramp.
  valence: 0.65,
  arousal: 0.5,
  certainty: 0.7,
  confidence: 0.8,
  lifetime: 320,
  penLift: 0.004,
  gestureScale: 1,
  followContours: true,
  useWear: false,
  hueCold: HUE_NEGATIVE,
  hueWarm: HUE_POSITIVE,
  inkLightness: 28,
};

const SLIDERS: {
  key: keyof Controls;
  label: string;
  min: number;
  max: number;
  step: number;
  group: string;
  format?: (v: number) => string;
}[] = [
  { key: "crinkle", label: "Crinkle depth", min: 0, max: 1, step: 0.01, group: "Paper" },
  { key: "grainScale", label: "Grain scale", min: 0.2, max: 3, step: 0.05, group: "Paper" },
  { key: "inkOpacity", label: "Ink opacity", min: 0.02, max: 1, step: 0.01, group: "Ink" },
  {
    key: "fadeRate",
    label: "Fade rate",
    min: 0,
    max: 0.05,
    step: 0.0005,
    group: "Ink",
    format: (v) => v.toFixed(4),
  },
  { key: "strokeCount", label: "Stroke count", min: 1, max: 40, step: 1, group: "Ink" },
  { key: "jitter", label: "Jitter (rad)", min: 0, max: 1, step: 0.01, group: "Ink" },
  { key: "lifetime", label: "Stroke lifetime (frames)", min: 30, max: 1200, step: 10, group: "Ink" },
  { key: "penLift", label: "Pen lift chance", min: 0, max: 0.05, step: 0.001, group: "Ink", format: (v) => v.toFixed(3) },
  { key: "gestureScale", label: "Gesture scale", min: 0.2, max: 3, step: 0.05, group: "Ink" },
  { key: "hueCold", label: "Hue — cold anchor", min: 150, max: 280, step: 1, group: "Ink" },
  { key: "hueWarm", label: "Hue — warm anchor", min: 0, max: 90, step: 1, group: "Ink" },
  { key: "inkLightness", label: "Ink lightness %", min: 12, max: 50, step: 1, group: "Ink" },
  { key: "valence", label: "valence", min: -1, max: 1, step: 0.01, group: "Sentiment" },
  { key: "arousal", label: "arousal", min: 0, max: 1, step: 0.01, group: "Sentiment" },
  { key: "certainty", label: "speaker_certainty", min: 0, max: 1, step: 0.01, group: "Sentiment" },
  { key: "confidence", label: "model_confidence", min: 0, max: 1, step: 0.01, group: "Sentiment" },
];

// ---- stage ---------------------------------------------------------------

const stage = document.getElementById("stage")!;
const view = document.createElement("canvas");
stage.appendChild(view);
const ctx = view.getContext("2d")!;

let paper = createPaperLayer(1, 1);
let ink = createInkLayer(1, 1);
const wear = new PaperWear();

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  view.width = w;
  view.height = h;
  paper.resize(w, h);
  ink.resize(w, h);
  paper.invalidate();
  seedInk();
}

// Everything visual eases; nothing snaps. Mirrors the app's easing loop.
const eased = {
  hue: 200,
  saturation: 40,
  opacity: controls.inkOpacity,
  speed: 1.2,
  jitter: controls.jitter,
  commitment: controls.certainty,
  crinkle: controls.crinkle,
  temperature: 0.5,
  penLift: controls.penLift,
};

function targets() {
  const warmth = Math.min(1, Math.max(0, (controls.valence + 1) / 2));
  const easedWarmth = Math.sign(controls.valence) *
      Math.abs(controls.valence) ** 0.55;
  const hueT = Math.min(1, Math.max(0, (easedWarmth + 1) / 2));

  return {
    hue: controls.hueCold + (controls.hueWarm - controls.hueCold) * hueT,
    saturation: 8 + 84 * controls.confidence,
    opacity: controls.inkOpacity * (0.25 + 0.75 * controls.confidence),
    speed: 0.5 + 4 * controls.arousal,
    jitter: controls.jitter * (0.3 + controls.arousal),
    commitment: controls.certainty,
    crinkle: controls.useWear ? wear.crinkle : controls.crinkle,
    temperature: 0.35 + warmth * 0.4,
    penLift: controls.penLift * (1.6 - controls.confidence),
  };
}

let t = 0;

function seedInk() {
  ink.clear();
  const target = targets();
  Object.assign(eased, target);
  ink.seed(inkParams(), t, 700);
}

function inkParams(): InkParams {
  return {
    strokeCount: controls.strokeCount,
    speed: eased.speed,
    jitter: eased.jitter,
    commitment: eased.commitment,
    opacity: eased.opacity,
    penLift: eased.penLift,
    hue: eased.hue,
    saturation: eased.saturation,
    lightness: controls.inkLightness,
    lifetime: controls.lifetime,
    followContours: controls.followContours,
    gestureScale: controls.gestureScale,
  };
}

function paperParams(): PaperParams {
  return {
    crinkle: eased.crinkle,
    grainScale: controls.grainScale,
    temperature: eased.temperature,
  };
}

let fadeAccumulator = 0;
let frames = 0;
let lastFpsAt = performance.now();
let fps = 0;

/** One full render. The only place the frame sequence is written. */
function renderOnce(now: number) {
  const target = targets();
  for (const key of Object.keys(eased) as (keyof typeof eased)[]) {
    eased[key] += (target[key] - eased[key]) * EASING;
  }

  if (controls.useWear) wear.add(controls.arousal);

  t += 0.004 + eased.speed * 0.0006;

  paper.update(paperParams(), t, now);

  // Fade in small periodic bites: one tiny erase per frame would round to
  // nothing, and a large one every frame would wipe the drawing.
  fadeAccumulator += controls.fadeRate;
  if (fadeAccumulator >= 0.004) {
    ink.fade(fadeAccumulator);
    fadeAccumulator = 0;
  }

  ink.step(inkParams(), t);

  ctx.clearRect(0, 0, view.width, view.height);
  blitPaper(ctx, paper, view.width, view.height);
  ctx.drawImage(ink.canvas, 0, 0);
}

function frame(now: number) {
  renderOnce(now);

  frames++;
  if (now - lastFpsAt >= 500) {
    fps = Math.round((frames * 1000) / (now - lastFpsAt));
    frames = 0;
    lastFpsAt = now;
    paintReadout();
  }

  requestAnimationFrame(frame);
}

// ---- panel ---------------------------------------------------------------

const panel = document.getElementById("panel")!;
const groups = new Map<string, HTMLFieldSetElement>();

panel.innerHTML =
  "<h1>Aura tuning</h1>" +
  "<p class='hint'>Same field, paper and ink modules the app will use. " +
  "Nothing here is wired into the app yet.</p>";

for (const slider of SLIDERS) {
  let group = groups.get(slider.group);
  if (!group) {
    group = document.createElement("fieldset");
    group.innerHTML = `<legend>${slider.group}</legend>`;
    panel.appendChild(group);
    groups.set(slider.group, group);
  }

  const row = document.createElement("div");
  row.className = "row";
  const id = `s-${slider.key}`;
  const value = controls[slider.key] as number;
  const fmt = slider.format ?? ((v: number) => String(Math.round(v * 100) / 100));

  row.innerHTML =
    `<label for="${id}">${slider.label}</label>` +
    `<output id="o-${slider.key}">${fmt(value)}</output>` +
    `<input type="range" id="${id}" min="${slider.min}" max="${slider.max}" ` +
    `step="${slider.step}" value="${value}" />`;
  group.appendChild(row);

  const input = row.querySelector("input")!;
  const out = row.querySelector("output")!;
  input.addEventListener("input", () => {
    const next = Number(input.value);
    (controls[slider.key] as number) = next;
    out.textContent = fmt(next);
    if (slider.key === "grainScale") paper.invalidate();
  });
}

function addCheckbox(
  key: "followContours" | "useWear",
  label: string,
  hint: string,
) {
  const wrap = document.createElement("label");
  wrap.className = "check";
  wrap.innerHTML =
    `<input type="checkbox" ${controls[key] ? "checked" : ""} /> ` +
    `<span>${label} <span style="color:var(--graphite)">${hint}</span></span>`;
  const box = wrap.querySelector("input")!;
  box.addEventListener("change", () => {
    controls[key] = box.checked;
  });
  groups.get("Ink")!.appendChild(wrap);
}

addCheckbox("followContours", "Follow contours", "(90° — avoids sinks)");
addCheckbox(
  "useWear",
  "Drive crinkle from wear",
  "(accumulates per frame here, so it saturates in seconds — the app must " +
    "add once per analysis update instead)",
);

const actions = document.createElement("div");
actions.className = "actions";
actions.innerHTML =
  "<button id='reseed'>Reseed ink</button>" +
  "<button id='resetwear' class='secondary'>Reset wear</button>";
panel.appendChild(actions);
actions.querySelector("#reseed")!.addEventListener("click", seedInk);
actions.querySelector("#resetwear")!.addEventListener("click", () => {
  wear.reset();
  paper.invalidate();
});

const readout = document.createElement("div");
readout.className = "readout";
panel.appendChild(readout);

const dump = document.createElement("textarea");
dump.id = "dump";
dump.readOnly = true;
panel.appendChild(dump);

function paintReadout() {
  readout.innerHTML =
    `fps <b>${fps}</b> &nbsp; pens <b>${ink.penCount}</b><br />` +
    `hue <b>${eased.hue.toFixed(0)}</b> &nbsp; sat <b>${eased.saturation.toFixed(0)}</b><br />` +
    `speed <b>${eased.speed.toFixed(2)}</b> &nbsp; passes <b>${
      1 + Math.round((1 - eased.commitment) * 3)
    }</b><br />` +
    `crinkle <b>${eased.crinkle.toFixed(3)}</b> &nbsp; wear <b>${wear.value.toFixed(3)}</b>`;

  dump.value = JSON.stringify(
    {
      crinkle: controls.crinkle,
      grainScale: controls.grainScale,
      inkOpacity: controls.inkOpacity,
      fadeRate: controls.fadeRate,
      strokeCount: controls.strokeCount,
      jitter: controls.jitter,
      lifetime: controls.lifetime,
      penLift: controls.penLift,
      gestureScale: controls.gestureScale,
      followContours: controls.followContours,
      hueCold: controls.hueCold,
      hueWarm: controls.hueWarm,
      inkLightness: controls.inkLightness,
    },
    null,
    1,
  );
}

// ---- go -----------------------------------------------------------------

window.addEventListener("resize", resize);
resize();
paintReadout();
requestAnimationFrame(frame);

// Lets a headless check drive frames when the tab is hidden and rAF is
// suspended. Dev-only page, so this is always available here.
(window as unknown as Record<string, unknown>).__tune = {
  step(n: number) {
    for (let i = 0; i < n; i++) renderOnce(performance.now());
    paintReadout();
  },
  seedInk,
  controls,
  wear,
  eased,
};
