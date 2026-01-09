
const SOUNDS = [
  "brtz.mp3",
  "mc_villager.mp3",
  "prrbmp.mp3",
  "glass-shattering.mp3",
  "rizzsound.mp3",
  "VineBoom.mp3",
];

// ==============================
// State
// ==============================
let audioCtx = null;
const buffers = new Map(); // filename -> AudioBuffer

let tracks = []; // {id, file, name, volume, muted, steps[]}
let stepsCount = 16;

let isPlaying = false;
let currentStep = 0;
let timerId = null;

// ==============================
// DOM
// ==============================
const elSoundList = document.getElementById("soundList");
const elSoundSearch = document.getElementById("soundSearch");
const elSoundCount = document.getElementById("soundCount");

const elDropZone = document.getElementById("dropZone");
const elTrackList = document.getElementById("trackList");
const elSequencer = document.getElementById("sequencer");

const btnPlay = document.getElementById("btnPlay");
const btnStop = document.getElementById("btnStop");
const btnClear = document.getElementById("btnClear");

const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const importFile = document.getElementById("importFile");

const bpmInput = document.getElementById("bpm");
const stepsSelect = document.getElementById("steps");

// ==============================
// Helpers
// ==============================
function uid() {
  return Math.random().toString(16).slice(2);
}

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function makeEmptySteps(n) {
  return Array.from({ length: n }, () => 0);
}

function stepDurationMs() {
  const bpm = Number(bpmInput?.value) || 120;
  const secPerBeat = 60 / bpm;
  const secPerStep = secPerBeat / 4; // 16tel
  return secPerStep * 1000;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ==============================
// Audio
// ==============================
async function loadBuffer(file) {
  if (buffers.has(file)) return buffers.get(file);

  const ctx = ensureAudio();
  const res = await fetch(`sounds/${encodeURIComponent(file)}`);
  if (!res.ok) throw new Error(`Sound nicht gefunden: sounds/${file} (${res.status})`);

  const arr = await res.arrayBuffer();
  const buf = await ctx.decodeAudioData(arr);
  buffers.set(file, buf);
  return buf;
}

function playSample(file, vol = 1.0) {
  const ctx = ensureAudio();
  const buf = buffers.get(file);
  if (!buf) return;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, vol));

  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

// ==============================
// Tracks / Sequencer
// ==============================
async function addTrack(file, options = {}) {
  await loadBuffer(file);

  const id = uid();
  const name = (options.name ?? file.replace(/\.[^/.]+$/, ""));

  tracks.push({
    id,
    file,
    name,
    volume: clamp01(options.volume ?? 0.9),
    muted: !!options.muted,
    steps: Array.isArray(options.steps) ? normalizeSteps(options.steps, stepsCount) : makeEmptySteps(stepsCount),
  });

  renderAll();
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeSteps(arr, n) {
  const out = makeEmptySteps(n);
  for (let i = 0; i < Math.min(arr.length, n); i++) out[i] = arr[i] ? 1 : 0;
  return out;
}

function setStepsCount(n) {
  stepsCount = n;

  for (const t of tracks) {
    t.steps = normalizeSteps(t.steps, stepsCount);
  }

  stop(true);
  renderSequencer();
}

function clearPatterns() {
  for (const t of tracks) t.steps = makeEmptySteps(stepsCount);
  renderSequencer();
}

// ==============================
// Playback
// ==============================
function clearNowIndicator() {
  document.querySelectorAll(".step.now").forEach(el => el.classList.remove("now"));
}

function updateNowIndicator(stepIndex) {
  clearNowIndicator();
  document.querySelectorAll(`[data-step="${stepIndex}"]`).forEach(el => el.classList.add("now"));
}

function tick() {
  updateNowIndicator(currentStep);

  for (const t of tracks) {
    if (t.muted) continue;
    if (t.steps[currentStep]) playSample(t.file, t.volume);
  }

  currentStep = (currentStep + 1) % stepsCount;
}

function start() {
  if (isPlaying) return;

  ensureAudio();
  if (audioCtx.state !== "running") audioCtx.resume().catch(() => {});

  isPlaying = true;
  btnPlay.textContent = "⏸ Pause";

  tick();
  timerId = setInterval(tick, stepDurationMs());
}

function stop(reset = false) {
  isPlaying = false;
  btnPlay.textContent = "▶ Play";

  if (timerId) clearInterval(timerId);
  timerId = null;

  clearNowIndicator();
  if (reset) currentStep = 0;
}

function updateTempoWhilePlaying() {
  if (!isPlaying) return;
  if (timerId) clearInterval(timerId);
  timerId = setInterval(tick, stepDurationMs());
}

// ==============================
// Render
// ==============================
function renderSoundList() {
  const q = (elSoundSearch.value || "").toLowerCase().trim();
  const list = q ? SOUNDS.filter(s => s.toLowerCase().includes(q)) : SOUNDS;

  elSoundList.innerHTML = "";
  elSoundCount.textContent = String(list.length);

  for (const file of list) {
    const item = document.createElement("div");
    item.className = "sounditem";
    item.draggable = true;

    item.innerHTML = `
      <div class="soundname">${escapeHtml(file)}</div>
      <div class="soundmeta">drag</div>
    `;

    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", file);
      e.dataTransfer.effectAllowed = "copy";
    });

    // Doppelklick = Preview
    item.addEventListener("dblclick", async () => {
      await loadBuffer(file).catch(console.error);
      playSample(file, 0.9);
    });

    elSoundList.appendChild(item);
  }
}

function renderTracksPanel() {
  elTrackList.innerHTML = "";

  for (const t of tracks) {
    const card = document.createElement("div");
    card.className = "trackcard";

    card.innerHTML = `
      <div class="tracktop">
        <div>
          <strong>${escapeHtml(t.name)}</strong>
          <div class="small">${escapeHtml(t.file)}</div>
        </div>

        <div class="trackactions">
          <button class="btn mini">${t.muted ? "Unmute" : "Mute"}</button>
          <button class="btn mini primary">Test</button>
          <button class="btn mini danger">Del</button>
        </div>
      </div>

      <div class="sliderrow">
        <span class="small">Vol</span>
        <input type="range" min="0" max="1" step="0.01" value="${t.volume}" />
      </div>
    `;

    const [btnMute, btnTest, btnDel] = card.querySelectorAll("button");
    const vol = card.querySelector('input[type="range"]');

    btnMute.addEventListener("click", () => {
      t.muted = !t.muted;
      renderTracksPanel();
      renderSequencer();
    });

    btnTest.addEventListener("click", async () => {
      await loadBuffer(t.file).catch(console.error);
      playSample(t.file, t.volume);
    });

    btnDel.addEventListener("click", () => {
      tracks = tracks.filter(x => x.id !== t.id);
      renderAll();
    });

    vol.addEventListener("input", (e) => {
      t.volume = clamp01(e.target.value);
    });

    elTrackList.appendChild(card);
  }
}

function renderSequencer() {
  elSequencer.innerHTML = "";
  elSequencer.className = "seq";

  if (tracks.length === 0) {
    elSequencer.innerHTML = `<div class="small">Noch keine Tracks. Zieh links einen Sound in die Drop Zone.</div>`;
    return;
  }

  for (const t of tracks) {
    const row = document.createElement("div");
    row.className = "seqrow";

    const name = document.createElement("div");
    name.className = "seqname";
    name.innerHTML = `
      <div>${escapeHtml(t.name)} ${t.muted ? '<span class="small">(muted)</span>' : ""}</div>
      <div class="small">${escapeHtml(t.file)}</div>
    `;

    const grid = document.createElement("div");
    grid.className = "grid";
    grid.style.gridTemplateColumns = `repeat(${stepsCount}, minmax(18px, 1fr))`;

    for (let i = 0; i < stepsCount; i++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "step" + (t.steps[i] ? " on" : "");
      cell.dataset.step = String(i);

      if (stepsCount >= 16 && i % 4 === 0) cell.style.borderColor = "rgba(255,255,255,0.18)";

      cell.addEventListener("click", () => {
        t.steps[i] = t.steps[i] ? 0 : 1;
        cell.classList.toggle("on", !!t.steps[i]);
      });

      grid.appendChild(cell);
    }

    row.appendChild(name);
    row.appendChild(grid);
    elSequencer.appendChild(row);
  }

  if (isPlaying) updateNowIndicator(currentStep);
}

function renderAll() {
  renderSoundList();
  renderTracksPanel();
  renderSequencer();
}

// ==============================
// Drag & Drop (Drop Zone)
// ==============================
elDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  elDropZone.classList.add("dragover");
});

elDropZone.addEventListener("dragleave", () => {
  elDropZone.classList.remove("dragover");
});

elDropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  elDropZone.classList.remove("dragover");

  const file = e.dataTransfer.getData("text/plain");
  if (!file) return;

  // Sicherheit: nur erlaubte Sounds
  if (!SOUNDS.includes(file)) return;

  await addTrack(file).catch(console.error);
});

// ==============================
// Import / Export
// ==============================
function buildExportObject() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    bpm: Number(bpmInput.value) || 120,
    stepsCount,
    tracks: tracks.map(t => ({
      file: t.file,
      name: t.name,
      volume: t.volume,
      muted: t.muted,
      steps: t.steps.map(x => (x ? 1 : 0)),
    })),
  };
}

function downloadJson(obj, filename = "beat.json") {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

async function importFromObject(data) {
  // basic validation
  if (!data || typeof data !== "object") throw new Error("Ungültige Datei (kein Objekt).");

  const nextSteps = Number(data.stepsCount);
  if (![8, 16, 32].includes(nextSteps)) throw new Error("Ungültige stepsCount (erlaubt: 8/16/32).");

  const nextBpm = Number(data.bpm);
  if (!Number.isFinite(nextBpm) || nextBpm < 40 || nextBpm > 240) throw new Error("Ungültige BPM.");

  if (!Array.isArray(data.tracks)) throw new Error("Ungültige Tracks.");

  // stop playback before changing everything
  stop(true);

  // apply settings
  bpmInput.value = String(Math.round(nextBpm));
  stepsSelect.value = String(nextSteps);
  stepsCount = nextSteps;

  // build tracks (nur erlaubte Sounds!)
  const importedTracks = [];
  for (const tr of data.tracks) {
    if (!tr || typeof tr !== "object") continue;
    if (!SOUNDS.includes(tr.file)) continue; // wichtig: nur server-sounds

    importedTracks.push({
      id: uid(),
      file: tr.file,
      name: String(tr.name ?? tr.file.replace(/\.[^/.]+$/, "")),
      volume: clamp01(tr.volume ?? 0.9),
      muted: !!tr.muted,
      steps: normalizeSteps(Array.isArray(tr.steps) ? tr.steps : [], stepsCount),
    });
  }

  tracks = importedTracks;

  // preload used buffers (optional, verhindert erstes Lag)
  await Promise.all(tracks.map(t => loadBuffer(t.file).catch(() => null)));

  renderAll();
}

btnExport.addEventListener("click", () => {
  const obj = buildExportObject();
  const safeDate = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadJson(obj, `beat-${safeDate}.json`);
});

btnImport.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = ""; // reset, damit gleicher file nochmal geht
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await importFromObject(data);
  } catch (err) {
    console.error(err);
    alert("Import fehlgeschlagen: " + (err?.message || err));
  }
});

// ==============================
// UI Events
// ==============================
elSoundSearch.addEventListener("input", renderSoundList);

btnPlay.addEventListener("click", async () => {
  // preload (optional)
  await Promise.all(SOUNDS.map(s => loadBuffer(s).catch(() => null)));

  if (!isPlaying) start();
  else stop(false);
});

btnStop.addEventListener("click", () => stop(true));
btnClear.addEventListener("click", clearPatterns);

bpmInput.addEventListener("input", updateTempoWhilePlaying);
stepsSelect.addEventListener("change", (e) => setStepsCount(Number(e.target.value)));

// ==============================
// Init
// ==============================
renderAll();
