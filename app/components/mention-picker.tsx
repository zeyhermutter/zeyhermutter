import { useEffect, useMemo, useRef, useState } from "react";

type MentionUser = { user_id: string; display_name: string };

export function MentionPicker({ users }: { users: MentionUser[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const normalized = (query ?? "").trim().toLocaleLowerCase("de-DE");
  const suggestions = useMemo(
    () => query === null
      ? []
      : users
          .filter((user) => !selected.includes(user.user_id))
          .filter((user) => !normalized || user.display_name.toLocaleLowerCase("de-DE").includes(normalized))
          .slice(0, 6),
    [users, selected, normalized, query],
  );

  function activeMention(value: string, cursor: number) {
    const before = value.slice(0, cursor);
    const match = before.match(/(?:^|\s)@([\p{L}\p{N}._-]*)$/u);
    return match ? match[1] : null;
  }

  function syncFromTextarea() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? textarea.value.length;
    setQuery(activeMention(textarea.value, cursor));
    setSelected((current) => current.filter((id) => {
      const user = users.find((item) => item.user_id === id);
      return Boolean(user && textarea.value.includes(`@${user.display_name}`));
    }));
  }

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    const textarea = form?.querySelector<HTMLTextAreaElement>('textarea[name="body"]') ?? null;
    textareaRef.current = textarea;
    if (!textarea) return;

    textarea.placeholder = "Interner Kommentar – @ tippen, um Sebastian oder Jochen zu erwähnen";
    textarea.addEventListener("input", syncFromTextarea);
    textarea.addEventListener("click", syncFromTextarea);
    textarea.addEventListener("keyup", syncFromTextarea);
    return () => {
      textarea.removeEventListener("input", syncFromTextarea);
      textarea.removeEventListener("click", syncFromTextarea);
      textarea.removeEventListener("keyup", syncFromTextarea);
      textareaRef.current = null;
    };
  }, [users]);

  function add(user: MentionUser) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? textarea.value.length;
    const before = textarea.value.slice(0, cursor);
    const after = textarea.value.slice(cursor);
    const atIndex = before.lastIndexOf("@");
    if (atIndex < 0) return;

    const insertion = `@${user.display_name} `;
    const nextValue = `${before.slice(0, atIndex)}${insertion}${after}`;
    textarea.value = nextValue;
    const nextCursor = atIndex + insertion.length;
    setSelected((current) => current.includes(user.user_id) ? current : [...current, user.user_id]);
    setQuery(null);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function remove(userId: string) {
    const user = users.find((item) => item.user_id === userId);
    const textarea = textareaRef.current;
    if (user && textarea) {
      textarea.value = textarea.value.replace(new RegExp(`@${user.display_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "g"), "");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setSelected((current) => current.filter((id) => id !== userId));
  }

  return (
    <div className="mention-picker" ref={rootRef}>
      {selected.map((id) => <input key={id} type="hidden" name="mention_user_id" value={id} />)}
      {query !== null && suggestions.length > 0 ? (
        <div className="mention-suggestions mention-suggestions-open" aria-label="Mögliche @Mentions">
          {suggestions.map((user) => (
            <button key={user.user_id} className="mention-chip" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => add(user)}>
              @{user.display_name}
            </button>
          ))}
        </div>
      ) : null}
      {selected.length ? (
        <div className="mention-selected">
          {selected.map((id) => {
            const user = users.find((item) => item.user_id === id);
            return user ? <button key={id} className="mention-chip selected" type="button" onClick={() => remove(id)}>@{user.display_name} ×</button> : null;
          })}
        </div>
      ) : null}
    </div>
  );
}
