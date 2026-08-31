import { useEffect } from "react";
import { useLocation } from "react-router";
import "~/live-list-filters.css";

const FILTER_FORM_SELECTOR = ".search-profile-filter-grid, .inquiry-filter-grid";
const SEARCH_DEBOUNCE_MS = 350;

export function LiveListFilters() {
  const location = useLocation();

  useEffect(() => {
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>(FILTER_FORM_SELECTOR));
    const cleanups: Array<() => void> = [];

    for (const form of forms) {
      const searchInput = form.querySelector<HTMLInputElement>('input[name="q"]');
      const searchLabel = searchInput?.closest("label");
      const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      let timer: number | undefined;

      form.classList.add("live-filter-form");
      searchLabel?.classList.add("live-search-field");
      searchInput?.classList.add("live-search-input");
      if (submitButton) submitButton.hidden = true;

      const submit = () => {
        if (timer) window.clearTimeout(timer);
        timer = undefined;
        form.requestSubmit();
      };

      const onInput = (event: Event) => {
        const target = event.target as HTMLInputElement | null;
        if (!target || target.name !== "q") return;
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(submit, SEARCH_DEBOUNCE_MS);
      };

      const onChange = (event: Event) => {
        const target = event.target as HTMLInputElement | HTMLSelectElement | null;
        if (!target || target.name === "q") return;
        submit();
      };

      form.addEventListener("input", onInput);
      form.addEventListener("change", onChange);
      cleanups.push(() => {
        if (timer) window.clearTimeout(timer);
        form.removeEventListener("input", onInput);
        form.removeEventListener("change", onChange);
        form.classList.remove("live-filter-form");
        searchLabel?.classList.remove("live-search-field");
        searchInput?.classList.remove("live-search-input");
        if (submitButton) submitButton.hidden = false;
      });
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [location.key, location.pathname]);

  return null;
}
