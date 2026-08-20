/**
 * Standalone tuning page for the highlighter renderer.
 *
 * Imports the same field, paper, keyword and highlighter modules the app uses,
 * so numbers dialled in here transfer directly. Not part of the production
 * build, and not wired into the app.
 */

import "./tune.css";
import { blitPaper, createPaperLayer } from "../aura/paper";
import { createHighlighterLayer } from "../aura/highlighter";
import { drawKeywords, mergePlaced, type PlacedKeyword } from "../aura/keywordPaper";
import { PaperWear } from "../aura/wear";
import { HIGHLIGHTER } from "../aura/preset";

const EASING = 0.04;
const FADE_BITE = 0.004;

const SAMPLE_WORDS: [string, number][] = [
  ["deployment", 0.95],
  ["numbers", 0.8],
  ["works", 0.9],
  ["failed", 0.85],
  ["logs", 0.55],
  ["approach", 0.5],
  ["strong", 0.7],
  ["needed", 0.6],
  ["meeting", 0.3],
  ["quarter", 0.45],
  ["broken", 0.75],
  ["shipping", 0.65],
];

interface Controls {
  crinkle: number;
  grainScale: number;
  thickness: number;
  speed: number;
  turnSharpness: number;
  alpha: number;
  fadeRate: number;
  hue: number;
  saturation: number;
  lightness: number;
  gestureScale: number;
  keywordCount: number;
  valence: number;
  arousal: number;
  certainty: number;
  confidence: number;
  driveFromSentiment: boolean;
}

const controls: Controls = {
  crinkle: 0.5,
  grainScale: HIGHLIGHTER.grainScale,
  thickness: 38,
  speed: 5.8,
  turnSharpness: 0.5,
  alpha: 0.2,
  fadeRate: HIGHLIGHTER.fadeRate,
  hue: HIGHLIGHTER.hue,
  saturation: HIGHLIGHTER.saturation,
  lightness: HIGHLIGHTER.lightness,
  gestureScale: HIGHLIGHTER.gestureScale,
  keywordCount: 12,
  valence: 0.3,
  arousal: 0.5,
  certainty: 0.7,
  confidence: 0.8,
  driveFromSentiment: false,
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
  { key: "grainScale", label: "Grain scale", min: 0.1, max: 2, step: 0.05, group: "Paper" },
  { key: "keywordCount", label: "Words on page", min: 0, max: 12, step: 1, group: "Paper" },
  { key: "thickness", label: "Nib thickness", min: 4, max: 90, step: 1, group: "Marker" },
  { key: "speed", label: "Stroke speed", min: 0.3, max: 14, step: 0.1, group: "Marker" },
  { key: "turnSharpness", label: "Turn sharpness", min: 0, max: 1, step: 0.01, group: "Marker" },
  { key: "alpha", label: "Stroke opacity", min: 0.02, max: 0.6, step: 0.005, group: "Marker", format: (v) => v.toFixed(3) },
  { key: "fadeRate", label: "Fade rate", min: 0, max: 0.008, step: 0.0001, group: "Marker", format: (v) => v.toFixed(4) },
  { key: "gestureScale", label: "Gesture scale", min: 0.1, max: 2, step: 0.05, group: "Marker" },
  { key: "hue", label: "Hue (fixed)", min: 280, max: 360, step: 1, group: "Colour" },
  { key: "saturation", label: "Saturation %", min: 40, max: 100, step: 1, group: "Colour" },
  { key: "lightness", label: "Lightness %", min: 40, max: 85, step: 1, group: "Colour" },
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
let marker = createHighlighterLayer(1, 1);
let placed: PlacedKeyword[] = [];
const wear = new PaperWear();

const eased = {
  hue: 330,
  saturation: controls.saturation,
  lightness: controls.lightness,
  alpha: controls.alpha,
  thickness: controls.thickness,
  speed: controls.speed,
  turnSharpness: controls.turnSharpness,
  crinkle: controls.crinkle,
  temperature: 0.5,
};

function targets() {
  if (!controls.driveFromSentiment) {
    const warmth = Math.min(1, Math.max(0, (controls.valence + 1) / 2));
    return {
      hue: controls.hue,
      saturation: controls.saturation,
      lightness: controls.lightness,
      alpha: controls.alpha,
      thickness: controls.thickness,
      speed: controls.speed,
      turnSharpness: controls.turnSharpness,
      crinkle: controls.crinkle,
      temperature: 0.35 + warmth * 0.4,
    };
  }

  // Mirrors highlighterMapping: fixed colour, valence as gesture, certainty
  // unmapped, confidence only on opacity.
  const v = Math.min(1, Math.max(-1, controls.valence));
  const eV = Math.sign(v) * Math.abs(v) ** 0.55;
  const pleasantness = Math.min(1, Math.max(0, (eV + 1) / 2));
  return {
    hue: controls.hue,
    saturation: controls.saturation,
    lightness: controls.lightness,
    alpha: HIGHLIGHTER.alphaMin +
      (HIGHLIGHTER.alphaMax - HIGHLIGHTER.alphaMin) * controls.confidence,
    thickness: HIGHLIGHTER.thicknessMin +
      (HIGHLIGHTER.thicknessMax - HIGHLIGHTER.thicknessMin) * controls.arousal,
    speed: HIGHLIGHTER.speedMin +
      (HIGHLIGHTER.speedMax - HIGHLIGHTER.speedMin) * controls.arousal,
    turnSharpness: 1 - pleasantness,
    crinkle: controls.crinkle,
    temperature: 0.35 + pleasantness * 0.4,
  };
}

function markerParams() {
  return {
    hue: eased.hue,
    saturation: eased.saturation,
    lightness: eased.lightness,
    alpha: eased.alpha,
    thickness: eased.thickness,
    speed: eased.speed,
    turnSharpness: eased.turnSharpness,
  };
}

function syncKeywords() {
  placed = [];
  const wanted = SAMPLE_WORDS.slice(0, controls.keywordCount);
  placed = mergePlaced(
    placed,
    wanted.map(([text, weight]) => ({ text, weight })),
    view.width,
    view.height,
    // Backdated so they are already faded in.
    -5000,
  );
}

function resize() {
  view.width = stage.clientWidth;
  view.height = stage.clientHeight;
  paper.resize(view.width, view.height);
  marker.resize(view.width, view.height);
  paper.invalidate();
  syncKeywords();
  reseed();
}

let t = 0;
let fadeAccumulator = 0;

function reseed() {
  marker.clear();
  Object.assign(eased, targets());
  marker.seed(markerParams(), t, HIGHLIGHTER.seedSteps);
}

let frames = 0;
let lastFpsAt = performance.now();
let fps = 0;

function renderOnce(now: number) {
  const target = targets();
  for (const key of Object.keys(eased) as (keyof typeof eased)[]) {
    eased[key] += (target[key] - eased[key]) * EASING;
  }

  t += 0.004 + eased.speed * 0.0006;

  paper.update(
    {
      crinkle: eased.crinkle,
      grainScale: controls.grainScale,
      temperature: eased.temperature,
    },
    t,
    now,
  );

  fadeAccumulator += controls.fadeRate;
  if (fadeAccumulator >= FADE_BITE) {
    marker.fade(fadeAccumulator);
    fadeAccumulator = 0;
  }

  marker.step(markerParams(), t);

  ctx.clearRect(0, 0, view.width, view.height);
  blitPaper(ctx, paper, view.width, view.height);
  drawKeywords(ctx, placed, now);

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(marker.canvas, 0, 0);
  ctx.restore();
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
  "<h1>Highlighter tuning</h1>" +
  "<p class='hint'>Same paper, keyword and marker modules the app uses. " +
  "The marker follows the Perlin field only — it never targets words.</p>";

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
    `<output>${fmt(value)}</output>` +
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
    if (slider.key === "keywordCount") syncKeywords();
  });
}

const sentimentToggle = document.createElement("label");
sentimentToggle.className = "check";
sentimentToggle.innerHTML =
  "<input type='checkbox' /> <span>Drive marker from sentiment " +
  "<span style='color:var(--graphite)'>(arousal sets thickness and speed, " +
  "valence sets turn sharpness, confidence sets opacity; certainty is " +
  "unmapped)</span></span>";
groups.get("Sentiment")!.appendChild(sentimentToggle);
sentimentToggle.querySelector("input")!.addEventListener("change", (e) => {
  controls.driveFromSentiment = (e.target as HTMLInputElement).checked;
});

const actions = document.createElement("div");
actions.className = "actions";
actions.innerHTML =
  "<button id='reseed'>Clear marks</button>" +
  "<button id='replace' class='secondary'>Re-place words</button>";
panel.appendChild(actions);
actions.querySelector("#reseed")!.addEventListener("click", reseed);
actions.querySelector("#replace")!.addEventListener("click", syncKeywords);

const readout = document.createElement("div");
readout.className = "readout";
panel.appendChild(readout);

const dump = document.createElement("textarea");
dump.id = "dump";
dump.readOnly = true;
panel.appendChild(dump);

function paintReadout() {
  readout.innerHTML =
    `fps <b>${fps}</b> &nbsp; words <b>${placed.length}</b><br />` +
    `hue <b>${(eased.hue % 360).toFixed(0)}</b> &nbsp; ` +
    `nib <b>${eased.thickness.toFixed(1)}</b><br />` +
    `speed <b>${eased.speed.toFixed(2)}</b> &nbsp; ` +
    `sharpness <b>${eased.turnSharpness.toFixed(2)}</b><br />` +
    `alpha <b>${eased.alpha.toFixed(3)}</b> &nbsp; ` +
    `crinkle <b>${eased.crinkle.toFixed(2)}</b>`;

  dump.value = JSON.stringify(
    {
      grainScale: controls.grainScale,
      thicknessAtMidArousal: controls.thickness,
      speedAtMidArousal: controls.speed,
      alpha: controls.alpha,
      fadeRate: controls.fadeRate,
      hue: controls.hue,
      saturation: controls.saturation,
      lightness: controls.lightness,
      gestureScale: controls.gestureScale,
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

// Lets a headless check drive frames while the tab is hidden and rAF is
// suspended. Dev-only page.
(window as unknown as Record<string, unknown>).__tune = {
  step(n: number) {
    for (let i = 0; i < n; i++) renderOnce(performance.now());
    paintReadout();
  },
  reseed,
  syncKeywords,
  controls,
  eased,
  wear,
  get placed() {
    return placed;
  },
};
