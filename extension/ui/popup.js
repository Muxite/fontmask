const presets = ["low", "balanced", "high_privacy"];

const populateSelect = (selectEl) => {
  presets.forEach((preset) => {
    const node = document.createElement("option");
    node.value = preset;
    node.textContent = preset
      .split("_")
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(" ");
    selectEl.appendChild(node);
  });
};

const loadState = async () => {
  const response = await chrome.runtime.sendMessage({ type: "fontmask/read-state" });
  if (!response?.ok) {
    return;
  }
  const presetEl = document.getElementById("preset");
  if (presetEl && response.state?.preset) {
    presetEl.value = response.state.preset;
  }
};

const bootstrap = async () => {
  populateSelect(document.getElementById("preset"));
  await loadState();
  document.getElementById("preset")?.addEventListener("change", async (event) => {
    await chrome.runtime.sendMessage({
      type: "fontmask/write-state",
      preset: event.target?.value ?? "balanced",
    });
    await chrome.runtime.sendMessage({ type: "fontmask/read-state" });
  });
  document.getElementById("advanced")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
};

bootstrap().catch(() => undefined);
