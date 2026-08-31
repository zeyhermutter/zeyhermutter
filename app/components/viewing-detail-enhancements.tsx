import { useEffect } from "react";
import { useLocation } from "react-router";
import "~/viewing-detail-enhancements.css";

const FINANCING_OPTIONS = [
  ["", "Nicht angegeben"],
  ["OPEN", "Offen"],
  ["IN_PROGRESS", "In Prüfung"],
  ["CONFIRMED", "Bestätigt"],
  ["NOT_REQUIRED", "Nicht erforderlich"],
] as const;

type ViewingHistoryPayload = {
  currentViewingId: string;
  viewings: Array<{ id: string; viewing_number: string; starts_at: string | null; status: string }>;
  audit: Array<{
    id: string;
    entity_id: string;
    occurred_at: string;
    actor_display_name_snapshot: string | null;
    action: string;
    description: string | null;
  }>;
  error?: string;
};

function plusOneHour(value: string) {
  if (!value) return "";
  const date = new Date(`${value}:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(date.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatHistoryDate(value: string) {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Berlin",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function openNativePicker(input: HTMLInputElement) {
  if (input.disabled || input.readOnly) return;
  const picker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
  if (typeof picker !== "function") return;
  try {
    picker.call(input);
  } catch {
    // Browser can reject showPicker outside direct user activation. Native fallback still works.
  }
}

function enhanceOfferFinancingFields() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="financing_status"]'));
  const allowed = new Set(FINANCING_OPTIONS.map(([value]) => value));

  for (const input of inputs) {
    const form = input.closest("form");
    const intent = form?.querySelector<HTMLInputElement>('input[name="_intent"]')?.value;
    if (intent !== "offer_create" && intent !== "offer_update") continue;

    const label = input.closest("label");
    if (!label || label.querySelector('select[data-offer-financing-select="true"]')) continue;

    const current = allowed.has(input.value as (typeof FINANCING_OPTIONS)[number][0]) ? input.value : "";
    input.value = current;
    input.style.display = "none";
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");

    const select = document.createElement("select");
    select.dataset.offerFinancingSelect = "true";
    select.setAttribute("aria-label", "Finanzierungsstatus");
    for (const [value, labelText] of FINANCING_OPTIONS) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = labelText;
      select.append(option);
    }
    select.value = current;
    select.addEventListener("change", () => {
      input.value = select.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    input.insertAdjacentElement("afterend", select);
  }
}

function enhanceCombinedViewingHistory(viewingId: string, cleanups: Array<() => void>) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".inquiry-page > section.data-card"));
  const historyCard = cards.find((card) => card.querySelector("h2")?.textContent?.trim() === "Änderungen");
  const historyList = historyCard?.querySelector<HTMLElement>(".history-list");
  if (!historyList || historyList.dataset.viewingHistoryChain) return;

  historyList.dataset.viewingHistoryChain = "loading";
  const controller = new AbortController();
  let injected: HTMLElement | null = null;

  fetch(`/api/viewings/${encodeURIComponent(viewingId)}/history`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) return null;
      return (await response.json()) as ViewingHistoryPayload;
    })
    .then((payload) => {
      if (!payload || payload.error || controller.signal.aborted) return;

      const previousEvents = payload.audit.filter((event) => event.entity_id !== payload.currentViewingId);
      historyList.dataset.viewingHistoryChain = "ready";
      if (!previousEvents.length) return;

      const viewingNumber = new Map(payload.viewings.map((viewing) => [viewing.id, viewing.viewing_number]));
      const relatedPreviousCount = payload.viewings.filter((viewing) => viewing.id !== payload.currentViewingId).length;

      injected = document.createElement("div");
      injected.className = "viewing-history-chain";
      injected.dataset.viewingChainHistory = "true";

      const separator = document.createElement("div");
      separator.className = "viewing-history-chain-head";
      const eyebrow = document.createElement("span");
      eyebrow.textContent = "Frühere Besichtigungstermine";
      const count = document.createElement("small");
      count.textContent = `${relatedPreviousCount} vorherige${relatedPreviousCount === 1 ? "r Termin" : " Termine"}`;
      separator.append(eyebrow, count);
      injected.append(separator);

      for (const event of previousEvents) {
        const article = document.createElement("article");
        article.className = "history-event viewing-chain-history-event";

        const head = document.createElement("div");
        head.className = "history-head";
        const strong = document.createElement("strong");
        const number = viewingNumber.get(event.entity_id) ?? "Frühere Besichtigung";
        strong.textContent = `${number} · ${event.actor_display_name_snapshot ?? "System"} · ${event.action}`;
        const small = document.createElement("small");
        small.textContent = formatHistoryDate(event.occurred_at);
        head.append(strong, small);
        article.append(head);

        if (event.description) {
          const description = document.createElement("p");
          description.textContent = event.description;
          article.append(description);
        }

        injected.append(article);
      }

      historyList.querySelector(".empty-state")?.remove();
      historyList.append(injected);
    })
    .catch(() => {
      if (!controller.signal.aborted) delete historyList.dataset.viewingHistoryChain;
    });

  cleanups.push(() => {
    controller.abort();
    injected?.remove();
    delete historyList.dataset.viewingHistoryChain;
  });
}

export function ViewingDetailEnhancements() {
  const location = useLocation();

  useEffect(() => {
    const onDateClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLInputElement>('input[type="date"], input[type="datetime-local"], input[type="time"]')
        : null;
      if (target) openNativePicker(target);
    };

    document.addEventListener("click", onDateClick, true);
    return () => document.removeEventListener("click", onDateClick, true);
  }, []);

  useEffect(() => {
    const viewingMatch = location.pathname.match(/^\/viewings\/([^/]+)\/?$/);
    const isViewingDetail = Boolean(viewingMatch);
    const isViewingNew = location.pathname === "/viewings/new";
    if (!isViewingDetail && !isViewingNew) return;

    const cleanups: Array<() => void> = [];
    const enhance = () => {
      if (isViewingDetail) {
        const cards = Array.from(document.querySelectorAll<HTMLElement>(".inquiry-page > section.data-card"));
        const statusCard = cards.find((card) => card.querySelector("h2")?.textContent?.trim() === "Besichtigungsablauf");
        const appointmentCard = cards.find((card) => card.querySelector("h2")?.textContent?.trim() === "Daten bearbeiten");
        statusCard?.classList.add("viewing-status-combined-card");
        appointmentCard?.classList.add("viewing-appointment-combined-card");

        const currentStatus = document.querySelector<HTMLElement>(".inquiry-workflow > .inquiry-status")?.textContent?.trim();
        if (currentStatus === "Durchgeführt") {
          const redundant = Array.from(document.querySelectorAll<HTMLFormElement>(".inquiry-workflow form")).find(
            (form) => form.querySelector<HTMLInputElement>('input[name="status"]')?.value === "PLANNED",
          );
          if (redundant) redundant.hidden = true;
        }

        enhanceOfferFinancingFields();
        if (viewingMatch?.[1]) enhanceCombinedViewingHistory(viewingMatch[1], cleanups);
      }

      const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
      for (const form of forms) {
        const start = form.querySelector<HTMLInputElement>('input[name="starts_at"][type="datetime-local"]');
        const end = form.querySelector<HTMLInputElement>('input[name="ends_at"][type="datetime-local"]');
        if (!start || !end || start.closest(".viewing-replan-modal") || start.dataset.durationEnhanced === "true") continue;

        start.dataset.durationEnhanced = "true";
        let autoManaged = !end.value || end.value === plusOneHour(start.value);
        if (!end.value && start.value) end.value = plusOneHour(start.value);

        const onStart = () => {
          if (autoManaged) end.value = plusOneHour(start.value);
        };
        const onEnd = () => {
          autoManaged = false;
        };
        const onEndFocus = () => {
          if (!end.value) autoManaged = true;
        };

        start.addEventListener("input", onStart);
        start.addEventListener("change", onStart);
        end.addEventListener("input", onEnd);
        end.addEventListener("focus", onEndFocus);
        cleanups.push(() => {
          start.removeEventListener("input", onStart);
          start.removeEventListener("change", onStart);
          end.removeEventListener("input", onEnd);
          end.removeEventListener("focus", onEndFocus);
          delete start.dataset.durationEnhanced;
        });
      }
    };

    const frame = window.requestAnimationFrame(enhance);
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [location.key, location.pathname]);

  return null;
}
