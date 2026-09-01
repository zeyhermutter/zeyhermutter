import { useEffect } from "react";

const MEASURE_TITLES: Record<string, string> = {
  CLEARANCE_DISPOSAL: "Entrümpelung vor Vermarktungsstart",
  CLEANING: "Grundreinigung der Immobilie",
  MINOR_REPAIRS: "Kleinreparaturen vor Vermarktung",
  PAINTING: "Malerarbeiten zur Verkaufsaufbereitung",
  FLOORING_PARQUET: "Boden- und Parkettaufbereitung",
  GARDEN_EXTERIOR: "Garten und Außenbereich aufbereiten",
  FURNITURE_STYLING: "Möblierung und Styling optimieren",
  DOCUMENTS: "Verkaufsunterlagen vervollständigen",
  ENERGY_CERTIFICATE: "Energieausweis bereitstellen",
  PHOTO_PREPARATION: "Immobilie für Fototermin vorbereiten",
  OTHER: "Sonstige Verkaufsaufbereitung",
};

const AUTO_MEASURE_TITLES = new Set(Object.values(MEASURE_TITLES));

type RangeNames = { minName: string; maxName: string };

function rangeNames(name: string): RangeNames | null {
  const suffixMin = name.match(/^(.*)_min$/i);
  if (suffixMin) return { minName: name, maxName: `${suffixMin[1]}_max` };

  const suffixMax = name.match(/^(.*)_max$/i);
  if (suffixMax) return { minName: `${suffixMax[1]}_min`, maxName: name };

  const prefixMin = name.match(/^min_(.+)$/i);
  if (prefixMin) return { minName: name, maxName: `max_${prefixMin[1]}` };

  const prefixMax = name.match(/^max_(.+)$/i);
  if (prefixMax) return { minName: `min_${prefixMax[1]}`, maxName: name };

  const camelMin = name.match(/^(.*)Min$/);
  if (camelMin) return { minName: name, maxName: `${camelMin[1]}Max` };

  const camelMax = name.match(/^(.*)Max$/);
  if (camelMax) return { minName: `${camelMax[1]}Min`, maxName: name };

  const bracketMin = name.match(/^(.*)\[min\]$/i);
  if (bracketMin) return { minName: name, maxName: `${bracketMin[1]}[max]` };

  const bracketMax = name.match(/^(.*)\[max\]$/i);
  if (bracketMax) return { minName: `${bracketMax[1]}[min]`, maxName: name };

  return null;
}

function namedInput(form: HTMLFormElement, name: string) {
  const control = form.elements.namedItem(name);
  return control instanceof HTMLInputElement ? control : null;
}

function numericValue(input: HTMLInputElement) {
  if (!input.value.trim()) return null;
  if (input.type === "number" || input.type === "range") {
    return Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null;
  }

  const normalized = input.value
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9+\-.]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function clearRangeState(input: HTMLInputElement) {
  input.setCustomValidity("");
  input.classList.remove("crm-range-invalid");
  input.removeAttribute("aria-invalid");
}

function markRangeState(input: HTMLInputElement, message: string) {
  input.setCustomValidity(message);
  input.classList.add("crm-range-invalid");
  input.setAttribute("aria-invalid", "true");
}

function validateRangePair(form: HTMLFormElement, names: RangeNames) {
  const minInput = namedInput(form, names.minName);
  const maxInput = namedInput(form, names.maxName);
  if (!minInput || !maxInput) return true;

  const min = numericValue(minInput);
  const max = numericValue(maxInput);
  if (min === null || max === null) {
    clearRangeState(minInput);
    clearRangeState(maxInput);
    return true;
  }

  if (max < min) {
    const message = "Der Maximalwert darf nicht kleiner als der Minimalwert sein.";
    markRangeState(minInput, message);
    markRangeState(maxInput, message);
    return false;
  }

  clearRangeState(minInput);
  clearRangeState(maxInput);
  return true;
}

function validateFormRanges(form: HTMLFormElement) {
  const seen = new Set<string>();
  let valid = true;

  for (const control of Array.from(form.elements)) {
    if (!(control instanceof HTMLInputElement) || !control.name) continue;
    const names = rangeNames(control.name);
    if (!names) continue;
    const key = `${names.minName}|${names.maxName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!validateRangePair(form, names)) valid = false;
  }

  return valid;
}

function euroFromInput(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(number);
}

function selectedLabel(select: HTMLSelectElement | null) {
  return select?.selectedOptions[0]?.textContent?.trim() || "—";
}

function enhanceMeasureForm(form: HTMLFormElement) {
  if (form.dataset.measureEnhanced === "true") return;
  form.dataset.measureEnhanced = "true";

  const category = form.elements.namedItem("category");
  const title = form.elements.namedItem("title");
  if (!(category instanceof HTMLSelectElement) || !(title instanceof HTMLInputElement)) return;

  let previousCategory = category.value;

  const applyAutomaticTitle = () => {
    const currentTitle = title.value.trim();
    const previousAutomatic = MEASURE_TITLES[previousCategory];
    if (!currentTitle || currentTitle === previousAutomatic || AUTO_MEASURE_TITLES.has(currentTitle)) {
      title.value = MEASURE_TITLES[category.value] || MEASURE_TITLES.OTHER;
      title.dispatchEvent(new Event("input", { bubbles: true }));
    }
    previousCategory = category.value;
  };

  if (!title.value.trim()) applyAutomaticTitle();

  category.addEventListener("change", applyAutomaticTitle);

  if (form.classList.contains("new-measure")) return;

  form.classList.add("readiness-measure-collapsible", "is-collapsed");

  const summary = document.createElement("div");
  summary.className = "readiness-measure-summary";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "readiness-measure-summary-button";
  toggle.setAttribute("aria-expanded", "false");

  const main = document.createElement("span");
  main.className = "readiness-measure-summary-main";
  const categoryText = document.createElement("small");
  const titleText = document.createElement("strong");
  main.append(categoryText, titleText);

  const meta = document.createElement("span");
  meta.className = "readiness-measure-summary-meta";
  const decisionText = document.createElement("span");
  decisionText.className = "readiness-measure-summary-pill";
  const statusText = document.createElement("span");
  statusText.className = "readiness-measure-summary-pill";
  const costText = document.createElement("span");
  costText.className = "readiness-measure-summary-cost";
  const toggleText = document.createElement("span");
  toggleText.className = "readiness-measure-summary-toggle";
  meta.append(decisionText, statusText, costText, toggleText);

  toggle.append(main, meta);
  summary.append(toggle);

  const grid = form.querySelector(".readiness-form-grid.compact");
  if (grid) form.insertBefore(summary, grid);
  else form.prepend(summary);

  const refreshSummary = () => {
    const decision = form.elements.namedItem("decision");
    const status = form.elements.namedItem("status");
    const costMin = form.elements.namedItem("cost_min");
    const costMax = form.elements.namedItem("cost_max");
    const expanded = !form.classList.contains("is-collapsed");

    categoryText.textContent = selectedLabel(category);
    titleText.textContent = title.value.trim() || "Maßnahme ohne Titel";
    decisionText.textContent = decision instanceof HTMLSelectElement ? selectedLabel(decision) : "—";
    statusText.textContent = status instanceof HTMLSelectElement ? selectedLabel(status) : "—";

    const min = costMin instanceof HTMLInputElement ? euroFromInput(costMin.value) : "";
    const max = costMax instanceof HTMLInputElement ? euroFromInput(costMax.value) : "";
    costText.textContent = min && max ? `${min} – ${max}` : min || max || "Noch keine Kostenspanne";
    toggleText.textContent = expanded ? "Details schließen ↑" : "Details öffnen ↓";
    toggle.setAttribute("aria-expanded", String(expanded));
  };

  toggle.addEventListener("click", () => {
    form.classList.toggle("is-collapsed");
    refreshSummary();
  });
  form.addEventListener("input", refreshSummary);
  form.addEventListener("change", refreshSummary);
  refreshSummary();
}

function enhanceMeasureForms(root: ParentNode = document) {
  for (const form of root.querySelectorAll<HTMLFormElement>("form.readiness-measure-editor")) {
    enhanceMeasureForm(form);
  }
}

function scanRanges(root: ParentNode = document) {
  const forms = root instanceof HTMLFormElement
    ? [root]
    : Array.from(root.querySelectorAll<HTMLFormElement>("form"));
  for (const form of forms) validateFormRanges(form);
}

export function CrmFormGuardrails() {
  useEffect(() => {
    scanRanges();
    enhanceMeasureForms();

    const onInput = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.form || !input.name) return;
      const names = rangeNames(input.name);
      if (names) validateRangePair(input.form, names);
    };

    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (validateFormRanges(form)) return;

      event.preventDefault();
      event.stopPropagation();
      form.classList.remove("is-collapsed");
      const invalid = form.querySelector<HTMLInputElement>(".crm-range-invalid");
      invalid?.focus();
      form.reportValidity();
    };

    const onDateClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const input = target.closest<HTMLInputElement>('input[type="date"]');
      if (!input || input.disabled || input.readOnly) return;
      const picker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
      if (typeof picker !== "function") return;
      try {
        picker.call(input);
      } catch {
        // Native browser fallback remains available; manual entry is never disabled.
      }
    };

    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onDateClick, true);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          scanRanges(node);
          enhanceMeasureForms(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onDateClick, true);
    };
  }, []);

  return null;
}
