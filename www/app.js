let audioCtx = null;
let buffers = new Map(); // key -> AudioBuffer (key = fileKey)
let fileMap = new Map(); // key -> File

let sounds = []; // { key, name } (name = filename)
let tracks = []; // {id, key, name, volume, muted, steps[]}

let isPlaying = false;
let currentStep = 0;
let timerId = null;
let stepsCount = 16;

const btnPickFolder = document.getElementById("btnPickFolder");
const folderInput = document.getElementById("folderInput");

const elSoundList = document.getElementById("soundList");
const elSoundSearch = document.getElementById("soundSearch");
const elSoundCount = document.getElementById("soundCount");

const elDropZone = document.getElementById("dropZone");
const elTrackList = document.getElementById("trackList");
const elSequencer = document.getElementById("sequencer");

const btnPlay = document.getElementById("btnPlay");
const btnStop = document.getElementById("btnStop");
const btnClear = document.getElementById("btnClear");
const bpmInput = document.getElementById("bpm");
const stepsSelect = document.getElementById("steps");

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
  const bpm = Number(bpmInput.value) || 120;
  const secPerBeat = 60 / bpm;
  const secPerStep = secPerBeat / 4; // 16tel
  return secPerStep * 1000;
}

async function loadBufferByKey(key) {
  if (buffers.has(key)) return buffers.get(key);
  const ctx = ensureAudio();

  const file = fileMap.get(key);
  if (!file) throw new Error("File fehlt: " + key);

  const arr = await file.arrayBuffer();
  const buf = await ctx.decodeAudioData(arr);
  buffers.set(key, buf);
  return buf;
}

function playSample(key, vol = 1.0) {
  const ctx = ensureAudio();
  const buf = buffers.get(key);
  if (!buf) return;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, vol));

  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

async function addTrackFromSoundKey(key) {
  await loadBufferByKey(key);

  const name = sounds.find(s => s.key === key)?.name ?? key;

  tracks.push({
    id: uid(),
    key,
    name: name.replace(/\.[^/.]+$/, ""),
    volume: 0.9,
    muted: false,
    steps: makeEmptySteps(stepsCount),
  });

  renderAll();
}

function renderSounds() {
  const q = (elSoundSearch.value || "").toLowerCase().trim();
  elSoundList.innerHTML = "";

  const filtered = sounds.filter(s => s.name.toLowerCase().includes(q));
  elSoundCount.textContent = String(filtered.length);

  for (const s of filtered) {
    const item = document.createElement("div");
    item.className = "sounditem";
    item.draggable = true;

    item.innerHTML = `
      <div class="soundname">${escapeHtml(s.name)}</div>
      <div class="soundmeta">drag</div>
    `;

    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", s.key);
      e.dataTransfer.effectAllowed = "copy";
    });

    item.addEventListener("dblclick", async () => {
      await loadBufferByKey(s.key).catch(console.error);
      playSample(s.key, 0.9);
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
          <div class="small">${escapeHtml(getOriginalFileName(t.key))}</div>
        </div>

        <div class="trackactions">
          <button class="btn mini" data-act="mute">${t.muted ? "Unmute" : "Mute"}</button>
          <button class="btn mini primary" data-act="test">Test</button>
          <button class="btn mini danger" data-act="del">Del</button>
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
      await loadBufferByKey(t.key).catch(console.error);
      playSample(t.key, t.volume);
    });

    btnDel.addEventListener("click", () => {
      tracks = tracks.filter(x => x.id !== t.id);
      renderAll();
    });

    vol.addEventListener("input", (e) => {
      t.volume = Number(e.target.value);
    });

    elTrackList.appendChild(card);
  }
}

function renderSequencer() {
  elSequencer.innerHTML = "";
  elSequencer.className = "seq";

  if (tracks.length === 0) {
    elSequencer.innerHTML = `<div class="small">Noch keine Tracks. Wähle den Ordner und zieh einen Sound in die Drop Zone.</div>`;
    return;
  }

  for (const t of tracks) {
    const row = document.createElement("div");
    row.className = "seqrow";

    const name = document.createElement("div");
    name.className = "seqname";
    name.innerHTML = `
      <div>${escapeHtml(t.name)} ${t.muted ? '<span class="small">(muted)</span>' : ""}</div>
      <div class="small">${escapeHtml(getOriginalFileName(t.key))}</div>
    `;

    const grid = document.createElement("div");
    grid.className = "grid";
    grid.style.gridTemplateColumns = `repeat(${stepsCount}, minmax(18px, 1fr))`;

    for (let i = 0; i < stepsCount; i++) {
      const cell = document.createElement("button");
      cell.className = "step" + (t.steps[i] ? " on" : "");
      cell.type = "button";
      cell.dataset.step = String(i);

      if (stepsCount >= 16 && (i % 4 === 0)) {
        cell.style.borderColor = "rgba(255,255,255,0.18)";
      }

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
  renderSounds();
  renderTracksPanel();
  renderSequencer();
}

function clearAllPatterns() {
  for (const t of tracks) t.steps = makeEmptySteps(stepsCount);
  renderSequencer();
}

function setStepsCount(n) {
  stepsCount = n;
  for (const t of tracks) {
    const ns = makeEmptySteps(stepsCount);
    for (let i = 0; i < Math.min(t.steps.length, stepsCount); i++) ns[i] = t.steps[i] ? 1 : 0;
    t.steps = ns;
  }
  stop(true);
  renderSequencer();
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

function tick() {
  updateNowIndicator(currentStep);

  for (const t of tracks) {
    if (t.muted) continue;
    if (t.steps[currentStep]) {
      playSample(t.key, t.volume);
    }
  }

  currentStep = (currentStep + 1) % stepsCount;
}

function clearNowIndicator() {
  document.querySelectorAll(".step.now").forEach(el => el.classList.remove("now"));
}

function updateNowIndicator(stepIndex) {
  clearNowIndicator();
  document.querySelectorAll(`[data-step="${stepIndex}"]`).forEach(el => el.classList.add("now"));
}

function getOriginalFileName(key) {
  return sounds.find(s => s.key === key)?.name ?? key;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ===== Folder-Picker: Sounds einlesen =====
btnPickFolder.addEventListener("click", () => folderInput.click());

folderInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  // Nur Audio-Dateien
  const audioFiles = files.filter(f => /\.(mp3|wav|ogg)$/i.test(f.name));

  // Key: wir nehmen den relativen Pfad (webkitRelativePath) falls vorhanden,
  // sonst name. So sind gleiche Namen in Unterordnern trotzdem eindeutig.
  sounds = [];
  fileMap.clear();
  buffers.clear(); // optional: bei neuem Ordner alte Buffers weg

  for (const f of audioFiles) {
    const rel = f.webkitRelativePath || f.name;
    const key = rel; // eindeutig genug
    fileMap.set(key, f);
    sounds.push({ key, name: f.name });
  }

  // Sortieren nach Dateiname
  sounds.sort((a, b) => a.name.localeCompare(b.name));

  // Tracks nicht automatisch löschen – wenn du willst, hier resetten:
  // tracks = [];

  renderAll();
});

// ===== Drag & Drop: Sound -> Track =====
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

  const key = e.dataTransfer.getData("text/plain");
  if (!key) return;

  await addTrackFromSoundKey(key).catch(console.error);
});

// ===== UI Events =====
elSoundSearch.addEventListener("input", renderSounds);

btnPlay.addEventListener("click", () => {
  if (!isPlaying) start();
  else stop(false);
});

btnStop.addEventListener("click", () => stop(true));

btnClear.addEventListener("click", clearAllPatterns);

bpmInput.addEventListener("input", updateTempoWhilePlaying);

stepsSelect.addEventListener("change", (e) => setStepsCount(Number(e.target.value)));

// Init
renderAll();
