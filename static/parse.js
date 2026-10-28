"use strict";
// Enkle regler (ingen AI), der foreslår titel, portioner, ingredienser og trin ud fra en opslagstekst.
// Resultatet er et forslag – brugeren kan altid rette det.

const LEAD = /^[\s\p{Extended_Pictographic}️‍•·▪◦‣○●\-–—*>✓✔]+/u;
const ING_HEAD = /^(ingredienser|ingrediens|ingredients|du skal bruge|det skal du bruge|you(?:'|’)?ll need|you need|what you need)\b/i;
const STEP_HEAD = /^(fremgangsmåde|sådan gør du|sådan laver du|tilberedning|metode|method|instructions|directions|steps|how to make|preparation)\b/i;
const OTHER_HEAD = /^(tips?|noter?|notes?|servering|serving suggestion|nutrition|næringsindhold)\b/i;
const NUM_STEP = /^(?:step\s*|trin\s*)?(\d{1,2})\s*[.)\-:]\s+/i;
const NUM = String.raw`\d+\s+[½¼¾⅓⅔⅛]|\d+\s+\d+\/\d+|\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|\d*\s*[½¼¾⅓⅔⅛]`;
const UNITS = String.raw`kg|g|gram|mg|liter|l|dl|cl|ml|tsk|spsk|tsp|tbsp|stk|fed|dåser|dåse|ds|pakker|pakke|pk|bundt|bdt|cups|cup|oz|lb|knivspids|nip|håndfuld|skiver|skive|kviste|kvist`;
const ING_RE = new RegExp(String.raw`^(${NUM})\s*(?:(${UNITS})\.?(?=\s|$))?\s*(.*)$`, "i");
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

function parseQty(s) {
  s = s.trim().replace(/\s*[-–]\s*[\d.,]+$/, ""); // "2-3" → 2
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); // "1 1/2"
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  let v = 0;
  const frac = s.match(/[½¼¾⅓⅔⅛]/);
  if (frac) { v += FRACTIONS[frac[0]]; s = s.replace(frac[0], "").trim(); }
  if (s.includes("/")) { const [a, b] = s.split("/").map((x) => parseFloat(x.replace(",", "."))); return v + (b ? a / b : 0); }
  if (s) v += parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

function parseIngredient(line) {
  const text = line.replace(LEAD, "").trim();
  const m = text.match(ING_RE);
  if (!m || !m[3]) return { qty: null, unit: "", name: text };
  return { qty: parseQty(m[1]), unit: (m[2] || "").toLowerCase(), name: m[3].trim() };
}

function fmtQty(q) {
  return (Math.round(q * 100) / 100).toLocaleString("da-DK");
}

function looksLikeIngredient(line) {
  return line.length <= 70 && ING_RE.test(line) && !NUM_STEP.test(line);
}

function cleanTitle(line) {
  let t = line.replace(/#\S+/g, "").replace(/[\p{Extended_Pictographic}️‍]/gu, "").replace(/\s+/g, " ").trim();
  t = t.replace(/[:\-–|]+$/, "").trim();
  if (t.length > 80) t = (t.match(/^.{20,80}?[.!?](?=\s)/) || [t.slice(0, 77) + "…"])[0];
  return t;
}

function parseCaption(text) {
  const out = { title: "", servings: null, ingredients: [], steps: [] };
  let mode = null; // null | "ing" | "steps" | "other"
  for (const raw of (text || "").split(/\r?\n/)) {
    let line = raw.replace(LEAD, "").trim();
    if (!line || /^(#\S+\s*)+$/.test(line)) continue;

    const serv = line.match(/(\d{1,2})\s*(?:personer|pers\b\.?|portioner|servings|people)/i) || line.match(/\bserves\s+(\d{1,2})/i);
    if (serv && !out.servings) out.servings = Number(serv[1]);

    const head = line.replace(/[:\s]+$/, "");
    const rest = line.includes(":") ? line.slice(line.indexOf(":") + 1).trim() : "";
    if (ING_HEAD.test(head) && head.length < 50) {
      mode = "ing";
      if (rest) out.ingredients.push(...rest.split(/,\s*/).filter(Boolean));
      continue;
    }
    if (STEP_HEAD.test(head) && head.length < 50) {
      mode = "steps";
      if (rest) out.steps.push(rest);
      continue;
    }
    if (OTHER_HEAD.test(head) && head.length < 40 && /:$/.test(line)) { mode = "other"; continue; }

    if (mode === "ing") {
      const prose = !looksLikeIngredient(line) && (line.length > 80 || (/[.!]$/.test(line) && line.length > 40));
      if (NUM_STEP.test(line) || prose) mode = "steps";
      else { out.ingredients.push(line); continue; }
    }
    if (mode === "steps") { out.steps.push(line.replace(NUM_STEP, "")); continue; }
    if (mode === "other") continue;

    // Ingen overskrifter (endnu): gæt ud fra linjens form
    if (NUM_STEP.test(line)) { out.steps.push(line.replace(NUM_STEP, "")); continue; }
    if (looksLikeIngredient(line)) { out.ingredients.push(line); continue; }
    if (!out.title) out.title = cleanTitle(line);
    else if (out.ingredients.length) out.steps.push(line); // løs tekst efter ingredienserne
  }
  return out;
}
