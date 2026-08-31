import { useEffect, useMemo, useRef, useState } from "react";

type MentionUser = { user_id: string; display_name: string };
type PopupPosition = { top: number; left: number; width: number };

export function MentionPicker({ users }: { users: MentionUser[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [resolvedUsers, setResolvedUsers] = useState<MentionUser[]>(users);
  const [popup, setPopup] = useState<PopupPosition | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const byId = new Map(users.map((user) => [user.user_id, user]));
    const options = Array.from(document.querySelectorAll<HTMLOptionElement>('select[name="primary_responsible_user"] option, select[name="responsible_user"] option'));
    for (const option of options) {
      const userId = option.value.trim();
      const displayName = option.textContent?.trim() ?? "";
      if (userId && displayName) byId.set(userId, { user_id: userId, display_name: displayName });
    }
    setResolvedUsers(Array.from(byId.values()).filter((user) => user.display_name === "Sebastian" || user.display_name === "Jochen"));
  }, [users]);

  const normalized = (query ?? "").trim().toLocaleLowerCase("de-DE");
  const suggestions = useMemo(
    () => query === null
      ? []
      : resolvedUsers
          .filter((user) => !selected.includes(user.user_id))
          .filter((user) => !normalized || user.display_name.toLocaleLowerCase("de-DE").includes(normalized))
          .slice(0, 6),
    [resolvedUsers, selected, normalized, query],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [normalized]);

  function activeMention(value: string, cursor: number) {
    const before = value.slice(0, cursor);
    const match = before.match(/(?:^|\s)@([\p{L}\p{N}._-]*)$/u);
    return match ? match[1] : null;
  }

  function positionPopup() {
    const textarea = textareaRef.current;
    if (!textarea) return setPopup(null);
    const rect = textarea.getBoundingClientRect();
    const width = Math.min(280, Math.max(220, rect.width - 16));
    const left = Math.max(8, Math.min(rect.left + 8, window.innerWidth - width - 8));
    const preferredTop = rect.bottom + 6;
    const top = preferredTop + 130 < window.innerHeight ? preferredTop : Math.max(8, rect.top - 136);
    setPopup({ top, left, width });
  }

  function syncFromTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? textarea.value.length;
    const mention = activeMention(textarea.value, cursor);
    setQuery(mention);
    if (mention !== null) positionPopup();
    else setPopup(null);

    const mentionedIds = resolvedUsers
      .filter((user) => new RegExp(`(?:^|\\s)@${user.display_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$|[.,!?;:])`, "u").test(textarea.value))
      .map((user) => user.user_id);
    setSelected(mentionedIds);
  }

  function add(user: MentionUser) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? textarea.value.length;
    const before = textarea.value.slice(0, cursor);
    const after = textarea.value.slice(cursor);
    const atIndex = before.lastIndexOf("@");
    if (atIndex < 0) return;

    const insertion = `@${user.display_name} `;
    textarea.value = `${before.slice(0, atIndex)}${insertion}${after}`;
    const nextCursor = atIndex + insertion.length;
    setSelected((current) => current.includes(user.user_id) ? current : [...current, user.user_id]);
    setQuery(null);
    setPopup(null);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    const textarea = form?.querySelector<HTMLTextAreaElement>('textarea[name="body"]') ?? null;
    textareaRef.current = textarea;
    if (!textarea) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (query === null || suggestions.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % suggestions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        add(suggestions[Math.min(activeIndex, suggestions.length - 1)]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setQuery(null);
        setPopup(null);
      }
    };

    textarea.placeholder = "Interner Kommentar – @ tippen, um Sebastian oder Jochen zu erwähnen";
    textarea.addEventListener("input", syncFromTextarea);
    textarea.addEventListener("click", syncFromTextarea);
    textarea.addEventListener("keyup", syncFromTextarea);
    textarea.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    return () => {
      textarea.removeEventListener("input", syncFromTextarea);
      textarea.removeEventListener("click", syncFromTextarea);
      textarea.removeEventListener("keyup", syncFromTextarea);
      textarea.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", positionPopup);
      window.removeEventListener("scroll", positionPopup, true);
      textareaRef.current = null;
    };
  }, [resolvedUsers, query, suggestions, activeIndex]);

  return (
    <div className="mention-picker" ref={rootRef}>
      {selected.map((id) => <input key={id} type="hidden" name="mention_user_id" value={id} />)}
      {query !== null && suggestions.length > 0 && popup ? (
        <div
          role="listbox"
          aria-label="Mögliche @Mentions"
          style={{
            position: "fixed",
            zIndex: 3200,
            top: popup.top,
            left: popup.left,
            width: popup.width,
            padding: 6,
            border: "1px solid #435254",
            borderRadius: 10,
            background: "#151c1d",
            boxShadow: "0 16px 42px rgba(0,0,0,.42)",
          }}
        >
          <div style={{ padding: "6px 8px 7px", color: "#7f8c8e", fontSize: 11, fontWeight: 700, letterSpacing: ".05em" }}>PERSON ERWÄHNEN</div>
          {suggestions.map((user, index) => (
            <button
              key={user.user_id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => add(user)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                border: 0,
                borderRadius: 7,
                background: index === activeIndex ? "#20292a" : "transparent",
                color: "#eef2f3",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: "50%", background: "#2a3638", fontSize: 12, fontWeight: 800 }}>{user.display_name.slice(0, 1)}</span>
              <span style={{ display: "grid", gap: 2 }}><strong style={{ fontSize: 13 }}>@{user.display_name}</strong><small style={{ color: "#869395" }}>Geschäftsführer</small></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
