// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WWW_DIR = path.join(__dirname, "www");
const SOUNDS_DIR = path.join(__dirname, "sounds");

app.use("/www", express.static(WWW_DIR));
app.use("/sounds", express.static(SOUNDS_DIR));

app.get("/api/sounds", (req, res) => {
  fs.readdir(SOUNDS_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: "Cannot read sounds directory" });

    // nur Audio-Dateien
    const audio = files
      .filter(f => /\.(mp3|wav|ogg)$/i.test(f))
      .sort((a, b) => a.localeCompare(b));

    res.json(audio);
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));
// server.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WWW_DIR = path.join(__dirname, "www");
const SOUNDS_DIR = path.join(__dirname, "sounds");

app.use("/www", express.static(WWW_DIR));
app.use("/sounds", express.static(SOUNDS_DIR));

app.get("/api/sounds", (req, res) => {
  fs.readdir(SOUNDS_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: "Cannot read sounds directory" });

    // nur Audio-Dateien
    const audio = files
      .filter(f => /\.(mp3|wav|ogg)$/i.test(f))
      .sort((a, b) => a.localeCompare(b));

    res.json(audio);
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));
