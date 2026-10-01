// Finner tempoet og taktslagene i musikksporet, så klippene kan legges på
// slag. (Techauge-promoen brukte et Python-skript; her er det Node, siden
// maskinen ikke har Python.)
//
//   node scripts/takt.mjs [public/musikk/spor.mp3]
//
// Skriver tempo, første slag og lydstyrken per takt, og lagrer resultatet i
// src/musikk/takt.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const fil = process.argv[2] ?? "public/musikk/spor.mp3";
const SR = 22050;
const raa = execFileSync("ffmpeg", ["-v", "error", "-i", fil, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
const x = new Float32Array(raa.buffer, raa.byteOffset, raa.byteLength / 4);
const varighet = x.length / SR;

// ---------- STFT og spektral fluks ----------
const N = 1024;
const HOP = 256;
const vindu = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));

const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const v = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(v * k), s = Math.sin(v * k);
        const a = i + k, b = a + len / 2;
        const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
};

const rammer = Math.floor((x.length - N) / HOP);
const fluks = new Float32Array(rammer);
const bassFluks = new Float32Array(rammer);
const energi = new Float32Array(rammer);
let forrige = new Float32Array(N / 2);
const bassGrense = Math.round((150 / SR) * N); // under 150 Hz: basstromme
for (let r = 0; r < rammer; r++) {
  const re = new Float32Array(N), im = new Float32Array(N);
  let e = 0;
  for (let i = 0; i < N; i++) { const v = x[r * HOP + i]; re[i] = v * vindu[i]; e += v * v; }
  energi[r] = e / N;
  fft(re, im);
  const mag = new Float32Array(N / 2);
  let f = 0, fb = 0;
  for (let k = 1; k < N / 2; k++) {
    mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
    const d = mag[k] - forrige[k];
    if (d > 0) { f += d; if (k <= bassGrense) fb += d; }
  }
  fluks[r] = f; bassFluks[r] = fb;
  forrige = mag;
}
const rammeSek = HOP / SR;

// Fjern langsom drift, så bare nedslagene står igjen
const normaliser = (sig) => {
  const ut = new Float32Array(sig.length);
  const b = Math.round(1 / rammeSek); // ett sekunds glidende snitt
  let sum = 0;
  for (let i = 0; i < sig.length; i++) {
    sum += sig[i];
    if (i >= b) sum -= sig[i - b];
    ut[i] = Math.max(0, sig[i] - sum / Math.min(i + 1, b));
  }
  return ut;
};
const onset = normaliser(fluks);
const bass = normaliser(bassFluks);

// ---------- tempo: autokorrelasjon, 70–180 BPM, litt forkjærlighet for 90–125 ----------
let best = { bpm: 0, poeng: -Infinity };
for (let bpm = 70; bpm <= 180; bpm += 0.05) {
  const lag = 60 / bpm / rammeSek;
  let s = 0;
  for (let i = 0; i + lag * 4 < onset.length; i++) {
    const a = onset[i];
    s += a * (lerp(onset, i + lag) + 0.5 * lerp(onset, i + 2 * lag) + 0.25 * lerp(onset, i + 4 * lag));
  }
  const prior = Math.exp(-0.5 * ((Math.log2(bpm / 108)) / 0.5) ** 2);
  const poeng = s * prior;
  if (poeng > best.poeng) best = { bpm, poeng };
}
function lerp(sig, t) {
  const i = Math.floor(t);
  const f = t - i;
  return (sig[i] ?? 0) * (1 - f) + (sig[i + 1] ?? 0) * f;
}
const slagSek = 60 / best.bpm;

// ---------- fasen: der slagene treffer flest nedslag ----------
let bestFase = { t: 0, poeng: -Infinity };
for (let t = 0; t < slagSek; t += 0.002) {
  let s = 0;
  for (let b = t; b < varighet - 0.1; b += slagSek) s += lerp(onset, b / rammeSek);
  if (s > bestFase.poeng) bestFase = { t, poeng: s };
}

// ---------- takt 1: det slaget i fireren med mest bass ----------
const slag = [];
for (let b = bestFase.t; b < varighet - 0.1; b += slagSek) slag.push(b);
const bassPaa = [0, 0, 0, 0];
slag.forEach((b, i) => { bassPaa[i % 4] += lerp(bass, b / rammeSek); });
const ener = bassPaa.indexOf(Math.max(...bassPaa));
const taktStart = slag[ener];

// ---------- lydstyrken per takt, i dB ----------
const takter = [];
for (let t = taktStart, n = 0; t + slagSek * 4 <= varighet + 0.01; t += slagSek * 4, n++) {
  const a = Math.floor(t / rammeSek), b = Math.floor((t + slagSek * 4) / rammeSek);
  let e = 0, eb = 0;
  for (let i = a; i < b && i < energi.length; i++) { e += energi[i]; eb += bass[i]; }
  takter.push({ takt: n, sek: +t.toFixed(3), db: +(10 * Math.log10(e / (b - a) + 1e-12)).toFixed(1), bass: +(eb / (b - a)).toFixed(2) });
}

console.log(`fil: ${fil}  (${varighet.toFixed(2)} s)`);
console.log(`tempo: ${best.bpm.toFixed(2)} BPM  (slag hvert ${slagSek.toFixed(4)} s = ${(slagSek * 30).toFixed(3)} bilder ved 30 fps)`);
console.log(`første slag: ${bestFase.t.toFixed(3)} s, takt 0 starter ${taktStart.toFixed(3)} s (slag ${ener + 1} i fireren)`);
console.log("\ntakt  start    dB     bass");
for (const t of takter) console.log(`${String(t.takt).padStart(4)}  ${t.sek.toFixed(2).padStart(6)}  ${t.db.toFixed(1).padStart(6)}  ${"█".repeat(Math.round(t.bass * 6))}`);

mkdirSync(path.resolve("src/musikk"), { recursive: true });
writeFileSync(
  path.resolve("src/musikk/takt.json"),
  JSON.stringify({ fil: path.basename(fil), varighet: +varighet.toFixed(3), bpm: +best.bpm.toFixed(3), slagSek: +slagSek.toFixed(5), takt0: +taktStart.toFixed(3), takter }, null, 2),
);
console.log("\nlagret: src/musikk/takt.json");
