const bindField = (id, value) => {
  const input = document.getElementById(id);
  if (input) {
    input.value = value ?? "";
  }
};

const readNumber = (id) => Number(document.getElementById(id)?.value);

const load = async () => {
  const response = await chrome.runtime.sendMessage({ type: "fontmask/read-state" });
  if (!response?.ok) {
    return;
  }
  const overrides = response.state?.overrides ?? {};
  bindField("measureTextMaxOffsetPx", overrides.metrics?.measureTextMaxOffsetPx);
  bindField("metricsQuantizeStepPx", overrides.metrics?.metricsQuantizeStepPx);
  bindField("phantomFontCount", overrides.fontSurface?.phantomFontCount);
  bindField(
    "fontCheckFlipProbability",
    overrides.fontSurface?.fontCheckFlipProbability
  );
  bindField(
    "maxFontsChecksPerInvocation",
    overrides.work?.maxFontsChecksPerInvocation
  );
};

const save = async () => {
  const overrides = {
    metrics: {
      measureTextMaxOffsetPx: readNumber("measureTextMaxOffsetPx"),
      metricsQuantizeStepPx: readNumber("metricsQuantizeStepPx"),
    },
    fontSurface: {
      phantomFontCount: readNumber("phantomFontCount"),
      fontCheckFlipProbability: readNumber("fontCheckFlipProbability"),
    },
    work: {
      maxFontsChecksPerInvocation: readNumber("maxFontsChecksPerInvocation"),
    },
  };
  await chrome.runtime.sendMessage({
    type: "fontmask/write-state",
    overrides,
  });
};

document.getElementById("save")?.addEventListener("click", () => {
  save().catch(() => undefined);
});

document.getElementById("export")?.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "fontmask/read-state" });
  if (!response?.ok) {
    return;
  }
  const blob = new Blob([JSON.stringify(response.state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "fontmask-config.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importBtn")?.addEventListener("click", () => {
  document.getElementById("import")?.click();
});

document.getElementById("import")?.addEventListener("change", async (event) => {
  const file = event.target?.files?.[0];
  if (!file) {
    return;
  }
  const text = await file.text();
  const parsed = JSON.parse(text);
  await chrome.runtime.sendMessage({
    type: "fontmask/write-state",
    preset: parsed.preset,
    overrides: parsed.overrides,
  });
  await load();
  event.target.value = "";
});

load().catch(() => undefined);
