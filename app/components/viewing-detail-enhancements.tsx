import { useEffect } from "react";
import { useLocation } from "react-router";
import "~/viewing-detail-enhancements.css";

function plusOneHour(value: string) {
  if (!value) return "";
  const date = new Date(`${value}:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(date.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ViewingDetailEnhancements() {
  const location = useLocation();

  useEffect(() => {
    const isViewingDetail = /^\/viewings\/[^/]+\/?$/.test(location.pathname);
    const isViewingNew = location.pathname === "/viewings/new";
    if (!isViewingDetail && !isViewingNew) return;

    const cleanups: Array<() => void> = [];
    const frame = window.requestAnimationFrame(() => {
      if (isViewingDetail) {
        const cards = Array.from(document.querySelectorAll<HTMLElement>(".inquiry-page > section.data-card"));
        const statusCard = cards.find((card) => card.querySelector("h2")?.textContent?.trim() === "Besichtigungsablauf");
        const appointmentCard = cards.find((card) => card.querySelector("h2")?.textContent?.trim() === "Daten bearbeiten");
        statusCard?.classList.add("viewing-status-combined-card");
        appointmentCard?.classList.add("viewing-appointment-combined-card");
        cleanups.push(() => {
          statusCard?.classList.remove("viewing-status-combined-card");
          appointmentCard?.classList.remove("viewing-appointment-combined-card");
        });
      }

      const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
      for (const form of forms) {
        const start = form.querySelector<HTMLInputElement>('input[name="starts_at"][type="datetime-local"]');
        const end = form.querySelector<HTMLInputElement>('input[name="ends_at"][type="datetime-local"]');
        if (!start || !end || start.closest(".viewing-replan-modal")) continue;

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
        });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [location.key, location.pathname]);

  return null;
}
