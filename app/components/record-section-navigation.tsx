import { useEffect, useState } from "react";
import { useLocation } from "react-router";

type SectionItem = { id: string; label: string };

function isSupportedDetail(pathname: string) {
  return /^\/(inquiries|search-profiles|viewings)\/[^/]+\/?$/.test(pathname);
}

function cleanLabel(value: string, fallback: string) {
  const label = value.replace(/\s+/g, " ").trim();
  return label || fallback;
}

export function RecordSectionNavigation() {
  const location = useLocation();
  const [items, setItems] = useState<SectionItem[]>([]);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    setItems([]);
    setActiveId("");
    if (!isSupportedDetail(location.pathname)) return;

    const frame = window.requestAnimationFrame(() => {
      const sections = Array.from(document.querySelectorAll<HTMLElement>(".editor-shell .data-card"));
      if (sections.length < 2) return;

      const nextItems = sections.map((section, index) => {
        const eyebrow = section.querySelector<HTMLElement>(".eyebrow")?.textContent ?? "";
        const heading = section.querySelector<HTMLElement>("h2")?.textContent ?? "";
        const label = cleanLabel(eyebrow, cleanLabel(heading, `Abschnitt ${index + 1}`));
        const id = `record-section-${index + 1}`;
        section.id = id;
        section.classList.add("record-section-target");
        return { id, label };
      });

      setItems(nextItems);
      setActiveId(nextItems[0]?.id ?? "");

      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          const id = visible[0]?.target.id;
          if (id) setActiveId(id);
        },
        { rootMargin: "-120px 0px -68% 0px", threshold: [0, 0.05] },
      );

      sections.forEach((section) => observer.observe(section));
      (window as Window & { __recordSectionObserver?: IntersectionObserver }).__recordSectionObserver?.disconnect();
      (window as Window & { __recordSectionObserver?: IntersectionObserver }).__recordSectionObserver = observer;
    });

    return () => {
      window.cancelAnimationFrame(frame);
      const holder = window as Window & { __recordSectionObserver?: IntersectionObserver };
      holder.__recordSectionObserver?.disconnect();
      delete holder.__recordSectionObserver;
    };
  }, [location.key, location.pathname]);

  if (!items.length) return null;

  return (
    <nav className="record-section-nav" aria-label="Abschnitte dieser Akte">
      {items.map((item) => (
        <a
          className={activeId === item.id ? "active" : ""}
          href={`#${item.id}`}
          key={item.id}
          onClick={() => setActiveId(item.id)}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
