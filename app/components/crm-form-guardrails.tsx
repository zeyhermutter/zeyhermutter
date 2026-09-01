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

const ACTIONABLE_DECISIONS = new Set([
  "URGENTLY_RECOMMENDED",
  "RECOMMENDED",
  "OPTIONAL",
]);
const NON_ACTIONABLE_DECISIONS = new Set(["NOT_RECOMMENDED", "NOT_REQUIRED"]);
const OPEN_DECISION_STATUSES = new Set([
  "PROPOSED",
  "QUOTE_REQUIRED",
  "QUOTE_REQUESTED",
  "QUOTE_RECEIVED",
]);
const NON_ACTIONABLE_STATUSES = new Set(["PROPOSED", "DISMISSED"]);
const OWNER_APPROVAL_REQUIRED_STATUSES = new Set([
  "APPROVED",
  "COMMISSIONED",
  "PLANNED",
  "IN_PROGRESS",
  "DONE",
  "CHECKED",
]);
const OWNER_APPROVAL_OK = new Set(["APPROVED", "NOT_REQUIRED"]);

type RangeNames = { minName: string; maxName: string };
type SelectOption = { value: string; label: string };

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

function selectOptions(select: HTMLSelectElement): SelectOption[] {
  return Array.from(select.options).map((option) => ({
    value: option.value,
    label: option.textContent || option.value,
  }));
}

function filterSelect(
  select: HTMLSelectElement,
  options: SelectOption[],
  allowed: Set<string>,
) {
  const selected = select.value;
  const nextOptions = options.filter((option) => allowed.has(option.value));
  select.replaceChildren(
    ...nextOptions.map((option) => {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      return element;
    }),
  );

  if (nextOptions.some((option) => option.value === selected)) {
    select.value = selected;
  } else if (nextOptions.length > 0) {
    select.value = nextOptions[0].value;
  }
}

function allowedDecisions(status: string) {
  const allowed = new Set<string>(ACTIONABLE_DECISIONS);
  if (OPEN_DECISION_STATUSES.has(status)) allowed.add("OPEN");
  if (NON_ACTIONABLE_STATUSES.has(status)) {
    allowed.add("NOT_RECOMMENDED");
    allowed.add("NOT_REQUIRED");
  }
  return allowed;
}

function allowedOwnerApprovals(status: string) {
  if (OWNER_APPROVAL_REQUIRED_STATUSES.has(status)) {
    return new Set(["APPROVED", "NOT_REQUIRED"]);
  }
  return new Set(["NOT_REQUESTED", "PENDING", "APPROVED", "REJECTED", "NOT_REQUIRED"]);
}

function allowedStatuses(input: {
  decision: string;
  ownerApproval: string;
  hasQuotePrice: boolean;
}) {
  const { decision, ownerApproval, hasQuotePrice } = input;

  if (NON_ACTIONABLE_DECISIONS.has(decision)) {
    return new Set(["PROPOSED", "DISMISSED"]);
  }

  if (decision === "OPEN") {
    const allowed = new Set(["PROPOSED", "QUOTE_REQUIRED", "QUOTE_REQUESTED"]);
    if (hasQuotePrice) allowed.add("QUOTE_RECEIVED");
    return allowed;
  }

  const allowed = new Set([
    "PROPOSED",
    "QUOTE_REQUIRED",
    "QUOTE_REQUESTED",
    "WAITING_OWNER",
    "BLOCKED",
    "DISMISSED",
  ]);
  if (hasQuotePrice) allowed.add("QUOTE_RECEIVED");
  if (OWNER_APPROVAL_OK.has(ownerApproval)) {
    for (const status of OWNER_APPROVAL_REQUIRED_STATUSES) allowed.add(status);
  }
  return allowed;
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

  const decision = form.elements.namedItem("decision");
  const status = form.elements.namedItem("status");
  const ownerApproval = form.elements.namedItem("owner_approval_status");
  const quotePrice = form.elements.namedItem("quote_price");

  if (
    decision instanceof HTMLSelectElement
    && status instanceof HTMLSelectElement
    && ownerApproval instanceof HTMLSelectElement
  ) {
    const allDecisionOptions = selectOptions(decision);
    const allStatusOptions = selectOptions(status);
    const allOwnerApprovalOptions = selectOptions(ownerApproval);

    const syncChoices = () => {
      filterSelect(decision, allDecisionOptions, allowedDecisions(status.value));
      filterSelect(ownerApproval, allOwnerApprovalOptions, allowedOwnerApprovals(status.value));
      filterSelect(
        status,
        allStatusOptions,
        allowedStatuses({
          decision: decision.value,
          ownerApproval: ownerApproval.value,
          hasQuotePrice: quotePrice instanceof HTMLInputElement && quotePrice.value.trim() !== "",
        }),
      );

      // Re-run the dependent filters once after status adjustment so all three
      // selects always describe a combination accepted by the backend rules.
      filterSelect(decision, allDecisionOptions, allowedDecisions(status.value));
      filterSelect(ownerApproval, allOwnerApprovalOptions, allowedOwnerApprovals(status.value));
    };

    decision.addEventListener("change", syncChoices);
    status.addEventListener("change", syncChoices);
    ownerApproval.addEventListener("change", syncChoices);
    if (quotePrice instanceof HTMLInputElement) {
      quotePrice.addEventListener("input", syncChoices);
      quotePrice.addEventListener("change", syncChoices);
    }
    syncChoices();
  }

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
    const currentDecision = form.elements.namedItem("decision");
    const currentStatus = form.elements.namedItem("status");
    const costMin = form.elements.namedItem("cost_min");
    const costMax = form.elements.namedItem("cost_max");
    const expanded = !form.classList.contains("is-collapsed");

    categoryText.textContent = selectedLabel(category);
    titleText.textContent = title.value.trim() || "Maßnahme ohne Titel";
    decisionText.textContent = currentDecision instanceof HTMLSelectElement ? selectedLabel(currentDecision) : "—";
    statusText.textContent = currentStatus instanceof HTMLSelectElement ? selectedLabel(currentStatus) : "—";

    const min = costMin instanceof HTMLInputElement ? euroFromInput(costMin.value) : "";
    const max = costMax instanceof HTMLInputElement ? euroFromInput(costMax.value) : "";
    costText.textContent = min && max ? `${min} – ${max}` : min || max || "Noch keine Kostenspanne";
    toggleText.textContent = expanded ? "Details schließen ↑" : "Details öffnen ↓";
    toggle.setAttribute("aria-expanded", String(expanded));
  };

  const collapse = () => {
    form.classList.add("is-collapsed");
    refreshSummary();
  };

  toggle.addEventListener("click", () => {
    form.classList.toggle("is-collapsed");
    refreshSummary();
  });
  form.addEventListener("input", refreshSummary);
  form.addEventListener("change", refreshSummary);
  form.addEventListener("readiness:collapse", collapse);
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

function submittedIntent(event: SubmitEvent, form: HTMLFormElement) {
  const submitter = event.submitter;
  if (submitter instanceof HTMLButtonElement && submitter.name === "_intent") return submitter.value;
  const field = form.elements.namedItem("_intent");
  return field instanceof HTMLInputElement ? field.value : "";
}

export function CrmFormGuardrails() {
  useEffect(() => {
    let pendingSavedMeasureId = "";

    scanRanges();
    enhanceMeasureForms();

    const collapseSavedMeasure = () => {
      if (!pendingSavedMeasureId) return;
      const success = Array.from(document.querySelectorAll<HTMLElement>(".success-banner.readiness-feedback"))
        .some((element) => element.textContent?.includes("Maßnahme gespeichert."));
      if (!success) return;

      const form = Array.from(document.querySelectorAll<HTMLFormElement>("form.readiness-measure-editor"))
        .find((candidate) => {
          const input = candidate.elements.namedItem("measure_id");
          return input instanceof HTMLInputElement && input.value === pendingSavedMeasureId;
        });
      if (!form) return;

      form.dispatchEvent(new Event("readiness:collapse"));
      pendingSavedMeasureId = "";
    };

    const onInput = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.form || !input.name) return;
      const names = rangeNames(input.name);
      if (names) validateRangePair(input.form, names);
    };

    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!validateFormRanges(form)) {
        event.preventDefault();
        event.stopPropagation();
        form.classList.remove("is-collapsed");
        const invalid = form.querySelector<HTMLInputElement>(".crm-range-invalid");
        invalid?.focus();
        form.reportValidity();
        return;
      }

      const submitEvent = event as SubmitEvent;
      if (
        submittedIntent(submitEvent, form) === "save_measure"
        && form.classList.contains("readiness-measure-editor")
        && !form.classList.contains("new-measure")
      ) {
        const measureId = form.elements.namedItem("measure_id");
        pendingSavedMeasureId = measureId instanceof HTMLInputElement ? measureId.value : "";
      }
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
      collapseSavedMeasure();
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
