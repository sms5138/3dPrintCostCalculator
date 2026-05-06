const STORAGE_KEY = "filamentCalc.v1";

const PRINTER_PRESETS = {
  p1s: {
    name: "Bambu Lab P1S",
    watts: 125,
    note: "Typical P1S draw: 100–150W while printing, with a brief 500–1000W spike during bed heat-up. 125W is a reasonable average for a typical print job.",
  },
  other: {
    name: "Other",
    watts: null,
    note: "Enter the printer's average wattage during a print. Most desktop FDM printers fall between 80W and 200W.",
  },
};

const defaultState = () => ({
  amsUnits: [createAms()],
  extFilament: null,
  electricity: { kwhRate: 0.15, printerWatts: 125, printerPreset: "p1s" },
  proposal: { items: [], timeHours: null },
});

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function createFilament() {
  return { id: uid(), color: "#cccccc", weightG: 1000, cost: 25 };
}

function createAms() {
  return {
    id: uid(),
    filaments: [createFilament(), createFilament(), createFilament(), createFilament()],
  };
}

let state = loadState() ?? defaultState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.warn("Failed to load state", e);
    return null;
  }
}

function migrate(s) {
  if (!s || typeof s !== "object") return defaultState();
  return {
    amsUnits: Array.isArray(s.amsUnits) && s.amsUnits.length ? s.amsUnits : [createAms()],
    extFilament: s.extFilament ?? null,
    electricity: (() => {
      const presetKey = PRINTER_PRESETS[s.electricity?.printerPreset] ? s.electricity.printerPreset : "p1s";
      const watts = presetKey === "other"
        ? Number(s.electricity?.printerWatts ?? 125)
        : PRINTER_PRESETS[presetKey].watts;
      return {
        kwhRate: Number(s.electricity?.kwhRate ?? 0.15),
        printerWatts: watts,
        printerPreset: presetKey,
      };
    })(),
    proposal: {
      items: Array.isArray(s.proposal?.items) ? s.proposal.items : [],
      timeHours: s.proposal?.timeHours ?? null,
    },
  };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save state", e);
  }
}

function getAllFilaments() {
  const list = [];
  state.amsUnits.forEach((ams, amsIdx) => {
    ams.filaments.forEach((f, slotIdx) => {
      list.push({ ...f, location: `AMS ${amsIdx + 1} · Slot ${slotIdx + 1}` });
    });
  });
  if (state.extFilament) {
    list.push({ ...state.extFilament, location: "External" });
  }
  return list;
}

function findFilament(id) {
  return getAllFilaments().find((f) => f.id === id);
}

// ---------- Rendering ----------

function renderAms() {
  const container = document.getElementById("ams-list");
  container.innerHTML = "";

  state.amsUnits.forEach((ams, idx) => {
    const unit = document.createElement("div");
    unit.className = "ams-unit";
    unit.innerHTML = `
      <div class="ams-head">
        <h3>AMS ${idx + 1}</h3>
        ${state.amsUnits.length > 1 ? `<button class="btn btn-danger" data-action="remove-ams" data-id="${ams.id}">Remove</button>` : ""}
      </div>
      <div class="filaments">
        ${ams.filaments.map((f, slotIdx) => filamentHtml(f, `Slot ${slotIdx + 1}`)).join("")}
      </div>
    `;
    container.appendChild(unit);
  });
}

function filamentHtml(f, label) {
  return `
    <div class="filament" data-filament-id="${f.id}">
      <button type="button" class="filament-swatch" data-action="open-color" data-filament-id="${f.id}" style="--swatch-color: ${escapeAttr(f.color)};" title="Click to choose color"></button>
      <div class="filament-fields">
        <span class="label-name">${label}</span>
        <div class="row">
          <label class="field-mini">
            <span>Purchased weight (g)</span>
            <input type="number" min="0" step="1" placeholder="1000" value="${f.weightG ?? ""}" data-field="weightG" />
          </label>
          <label class="field-mini">
            <span>Purchased cost ($)</span>
            <input type="number" min="0" step="0.01" placeholder="25.00" value="${f.cost ?? ""}" data-field="cost" />
          </label>
        </div>
      </div>
    </div>
  `;
}

function renderExt() {
  const btn = document.getElementById("toggle-ext-btn");
  const container = document.getElementById("ext-container");
  if (state.extFilament) {
    btn.textContent = "Remove";
    container.innerHTML = `<div class="filaments">${filamentHtml(state.extFilament, "External spool")}</div>`;
  } else {
    btn.textContent = "+ Add External";
    container.innerHTML = `<p class="empty-msg">No external filament configured.</p>`;
  }
}

function renderElectricity() {
  document.getElementById("kwh-rate").value = state.electricity.kwhRate ?? "";

  const presetSelect = document.getElementById("printer-preset");
  if (!presetSelect.options.length) {
    presetSelect.innerHTML = Object.entries(PRINTER_PRESETS)
      .map(([key, p]) => `<option value="${key}">${p.name}</option>`)
      .join("");
  }
  presetSelect.value = state.electricity.printerPreset;

  const wattsInput = document.getElementById("printer-watts");
  wattsInput.value = state.electricity.printerWatts ?? "";
  wattsInput.disabled = state.electricity.printerPreset !== "other";

  document.getElementById("printer-note").textContent =
    PRINTER_PRESETS[state.electricity.printerPreset]?.note ?? "";
}

function renderProposal() {
  const container = document.getElementById("proposal-items");
  container.innerHTML = "";

  if (state.proposal.items.length === 0) {
    container.innerHTML = `<p class="empty-msg">No filaments added to this print yet.</p>`;
  } else {
    const filaments = getAllFilaments();
    state.proposal.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "proposal-item";
      row.dataset.itemId = item.id;
      const selectedFilament = filaments.find((f) => f.id === item.filamentId);
      const swatchColor = selectedFilament?.color ?? "#444";
      row.innerHTML = `
        <span class="proposal-swatch" style="--swatch-color: ${escapeAttr(swatchColor)};"></span>
        <label class="field-mini proposal-field">
          <span>Filament</span>
          <select data-field="filamentId">
            <option value="">— Select filament —</option>
            ${filaments
              .map(
                (f) =>
                  `<option value="${f.id}" ${
                    f.id === item.filamentId ? "selected" : ""
                  }>${f.location} — ${f.color}</option>`
              )
              .join("")}
          </select>
        </label>
        <label class="field-mini weight-input">
          <span>Weight used (g)</span>
          <input type="number" min="0" step="1" placeholder="50" value="${
            item.weightG ?? ""
          }" data-field="weightG" />
        </label>
        <button class="btn btn-danger" data-action="remove-proposal-item" aria-label="Remove">×</button>
      `;
      container.appendChild(row);
    });
  }

  const hoursInput = document.getElementById("print-hours");
  hoursInput.value = state.proposal.timeHours ?? "";
}

function renderAll() {
  renderAms();
  renderExt();
  renderElectricity();
  renderProposal();
}

function escapeAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}

// ---------- Event handling ----------

function findFilamentRef(id) {
  for (const ams of state.amsUnits) {
    const f = ams.filaments.find((x) => x.id === id);
    if (f) return f;
  }
  if (state.extFilament?.id === id) return state.extFilament;
  return null;
}

document.getElementById("ams-list").addEventListener("input", (e) => {
  const filEl = e.target.closest(".filament");
  if (!filEl) return;
  const id = filEl.dataset.filamentId;
  const field = e.target.dataset.field;
  const f = findFilamentRef(id);
  if (!f) return;
  if (field === "weightG") {
    f.weightG = e.target.value === "" ? null : Number(e.target.value);
  } else if (field === "cost") {
    f.cost = e.target.value === "" ? null : Number(e.target.value);
  }
  saveState();
});

document.getElementById("ams-list").addEventListener("click", (e) => {
  const action = e.target.dataset.action;
  if (action === "remove-ams") {
    const id = e.target.dataset.id;
    state.amsUnits = state.amsUnits.filter((a) => a.id !== id);
    saveState();
    renderAll();
  }
});

document.getElementById("add-ams-btn").addEventListener("click", () => {
  state.amsUnits.push(createAms());
  saveState();
  renderAll();
});

document.getElementById("ext-container").addEventListener("input", (e) => {
  if (!state.extFilament) return;
  const field = e.target.dataset.field;
  if (field === "weightG") {
    state.extFilament.weightG = e.target.value === "" ? null : Number(e.target.value);
  } else if (field === "cost") {
    state.extFilament.cost = e.target.value === "" ? null : Number(e.target.value);
  }
  saveState();
});

document.getElementById("toggle-ext-btn").addEventListener("click", () => {
  if (state.extFilament) {
    state.extFilament = null;
  } else {
    state.extFilament = createFilament();
  }
  saveState();
  renderAll();
});

document.getElementById("kwh-rate").addEventListener("input", (e) => {
  state.electricity.kwhRate = e.target.value === "" ? null : Number(e.target.value);
  saveState();
});

document.getElementById("printer-watts").addEventListener("input", (e) => {
  state.electricity.printerWatts = e.target.value === "" ? null : Number(e.target.value);
  saveState();
});

document.getElementById("printer-preset").addEventListener("change", (e) => {
  const key = e.target.value;
  state.electricity.printerPreset = key;
  if (key !== "other") {
    state.electricity.printerWatts = PRINTER_PRESETS[key].watts;
  }
  saveState();
  renderElectricity();
});

document.getElementById("add-proposal-item-btn").addEventListener("click", () => {
  state.proposal.items.push({ id: uid(), filamentId: "", weightG: null });
  saveState();
  renderProposal();
});

document.getElementById("proposal-items").addEventListener("input", (e) => {
  const row = e.target.closest(".proposal-item");
  if (!row) return;
  const itemId = row.dataset.itemId;
  const item = state.proposal.items.find((i) => i.id === itemId);
  if (!item) return;
  const field = e.target.dataset.field;
  if (field === "filamentId") {
    item.filamentId = e.target.value;
    renderProposal();
  } else if (field === "weightG") {
    item.weightG = e.target.value === "" ? null : Number(e.target.value);
  }
  saveState();
});

document.getElementById("proposal-items").addEventListener("click", (e) => {
  if (e.target.dataset.action === "remove-proposal-item") {
    const row = e.target.closest(".proposal-item");
    const itemId = row.dataset.itemId;
    state.proposal.items = state.proposal.items.filter((i) => i.id !== itemId);
    saveState();
    renderProposal();
  }
});

document.getElementById("print-hours").addEventListener("input", (e) => {
  state.proposal.timeHours = e.target.value === "" ? null : Number(e.target.value);
  saveState();
});

document.getElementById("calculate-btn").addEventListener("click", () => {
  renderResult(calculate());
});

// ---------- Calculation ----------

function calculate() {
  const errors = [];
  const lines = [];
  let filamentTotal = 0;

  if (state.proposal.items.length === 0) {
    errors.push("Add at least one filament to the proposed print.");
  }

  state.proposal.items.forEach((item, idx) => {
    if (!item.filamentId) {
      errors.push(`Item ${idx + 1}: choose a filament.`);
      return;
    }
    const f = findFilament(item.filamentId);
    if (!f) {
      errors.push(`Item ${idx + 1}: selected filament no longer exists.`);
      return;
    }
    if (!item.weightG || item.weightG <= 0) {
      errors.push(`Item ${idx + 1}: enter the weight used (g).`);
      return;
    }
    if (!f.weightG || f.weightG <= 0 || !Number.isFinite(f.cost)) {
      errors.push(`Item ${idx + 1}: filament missing purchased weight or cost.`);
      return;
    }
    const cost = (item.weightG / f.weightG) * f.cost;
    filamentTotal += cost;
    lines.push({
      label: `Filament: ${f.location} (${item.weightG} g)`,
      detail: `${item.weightG} g × ${(f.cost / f.weightG).toFixed(4)}/g`,
      value: cost,
    });
  });

  const hours = Number(state.proposal.timeHours);
  if (!hours || hours <= 0) errors.push("Enter the estimated print time (hours).");

  const kwhRate = Number(state.electricity.kwhRate);
  const watts = Number(state.electricity.printerWatts);
  if (!Number.isFinite(kwhRate) || kwhRate < 0) errors.push("Enter a valid kWh rate.");
  if (!Number.isFinite(watts) || watts < 0) errors.push("Enter a valid printer wattage.");

  let electricityCost = 0;
  if (errors.length === 0) {
    electricityCost = hours * (watts / 1000) * kwhRate;
    lines.push({
      label: `Electricity (${hours} h)`,
      detail: `${hours} h × ${watts} W × ${kwhRate}/kWh`,
      value: electricityCost,
    });
  }

  return {
    errors,
    lines,
    total: filamentTotal + electricityCost,
  };
}

function renderResult({ errors, lines, total }) {
  const el = document.getElementById("result");
  el.classList.remove("hidden");
  if (errors.length) {
    el.innerHTML = `
      <h3>Can't calculate yet</h3>
      ${errors.map((e) => `<div class="result-error">• ${e}</div>`).join("")}
    `;
    return;
  }
  el.innerHTML = `
    <h3>Estimated cost</h3>
    ${lines
      .map(
        (l) => `
      <div class="result-line">
        <span>${l.label}<span class="label-detail">${l.detail}</span></span>
        <span>$${l.value.toFixed(2)}</span>
      </div>`
      )
      .join("")}
    <div class="result-line total">
      <span>Total</span>
      <span>$${total.toFixed(2)}</span>
    </div>
  `;
}

// ---------- Color picker modal ----------

const COLOR_PRESETS = [
  { name: "White", hex: "#ffffff" },
  { name: "Light Gray", hex: "#cccccc" },
  { name: "Gray", hex: "#888888" },
  { name: "Black", hex: "#1a1a1a" },
  { name: "Red", hex: "#d92626" },
  { name: "Orange", hex: "#ff7a1a" },
  { name: "Yellow", hex: "#ffd400" },
  { name: "Lime", hex: "#9bdc1d" },
  { name: "Green", hex: "#1ea84a" },
  { name: "Teal", hex: "#1abc9c" },
  { name: "Cyan", hex: "#00bcd4" },
  { name: "Blue", hex: "#2962ff" },
  { name: "Purple", hex: "#7c3aed" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Brown", hex: "#8b4513" },
  { name: "Beige", hex: "#d2b48c" },
];

const colorModal = document.getElementById("color-modal");
const colorInput = document.getElementById("color-input");
const colorHex = document.getElementById("color-hex");
const colorPreview = document.getElementById("color-preview");
const colorPresets = document.getElementById("color-presets");

colorPresets.innerHTML = COLOR_PRESETS.map(
  (p) =>
    `<button type="button" class="color-preset" data-color="${p.hex}" title="${p.name}" style="background: ${p.hex};"></button>`
).join("");

let colorEditTarget = null;
let draftColor = "#cccccc";

function isValidHex(s) {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

function setDraftColor(hex, syncInputs = true) {
  if (!isValidHex(hex)) return;
  draftColor = hex.toLowerCase();
  colorPreview.style.background = draftColor;
  if (syncInputs) {
    colorInput.value = draftColor;
    colorHex.value = draftColor;
  }
}

function openColorPicker(filamentId) {
  const f = findFilamentRef(filamentId);
  if (!f) return;
  colorEditTarget = filamentId;
  setDraftColor(isValidHex(f.color) ? f.color : "#cccccc");
  colorModal.classList.remove("hidden");
  colorModal.setAttribute("aria-hidden", "false");
}

function closeColorPicker() {
  colorEditTarget = null;
  colorModal.classList.add("hidden");
  colorModal.setAttribute("aria-hidden", "true");
}

function saveColor() {
  if (!colorEditTarget) return;
  const f = findFilamentRef(colorEditTarget);
  if (f) {
    f.color = draftColor;
    saveState();
    renderAll();
  }
  closeColorPicker();
}

document.body.addEventListener("click", (e) => {
  const swatch = e.target.closest("[data-action='open-color']");
  if (swatch) openColorPicker(swatch.dataset.filamentId);
});

colorInput.addEventListener("input", (e) => setDraftColor(e.target.value));
colorHex.addEventListener("input", (e) => {
  let v = e.target.value.trim();
  if (v && !v.startsWith("#")) v = "#" + v;
  if (isValidHex(v)) setDraftColor(v, false);
});
colorPresets.addEventListener("click", (e) => {
  const preset = e.target.closest("[data-color]");
  if (preset) setDraftColor(preset.dataset.color);
});
document.getElementById("color-save").addEventListener("click", saveColor);
colorModal.addEventListener("click", (e) => {
  if (e.target.dataset.action === "close-color") closeColorPicker();
});

// ---------- Backup modal ----------

const backupModal = document.getElementById("backup-modal");

function openBackupModal() {
  backupModal.classList.remove("hidden");
  backupModal.setAttribute("aria-hidden", "false");
}

function closeBackupModal() {
  backupModal.classList.add("hidden");
  backupModal.setAttribute("aria-hidden", "true");
}

document.getElementById("open-backup-btn").addEventListener("click", openBackupModal);

backupModal.addEventListener("click", (e) => {
  if (e.target.dataset.action === "close-modal") closeBackupModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!colorModal.classList.contains("hidden")) closeColorPicker();
  else if (!backupModal.classList.contains("hidden")) closeBackupModal();
});

// ---------- Import / Export ----------

document.getElementById("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `filament-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("import-btn").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    state = migrate(parsed);
    saveState();
    renderAll();
    document.getElementById("result").classList.add("hidden");
    closeBackupModal();
  } catch (err) {
    alert("Could not import: " + err.message);
  } finally {
    e.target.value = "";
  }
});

// ---------- Init ----------

renderAll();
