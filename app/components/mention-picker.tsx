import { useMemo, useState } from "react";

type MentionUser = { user_id: string; display_name: string };

export function MentionPicker({ users }: { users: MentionUser[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const normalized = query.trim().replace(/^@/, "").toLocaleLowerCase("de-DE");
  const suggestions = useMemo(
    () => users.filter((user) => !selected.includes(user.user_id) && (!normalized || user.display_name.toLocaleLowerCase("de-DE").includes(normalized))).slice(0, 6),
    [users, selected, normalized],
  );

  function add(userId: string) {
    setSelected((current) => current.includes(userId) ? current : [...current, userId]);
    setQuery("");
  }

  function remove(userId: string) {
    setSelected((current) => current.filter((id) => id !== userId));
  }

  return (
    <div className="mention-picker">
      {selected.map((id) => <input key={id} type="hidden" name="mention_user_id" value={id} />)}
      <label>
        <span>@Mention</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="@ Nutzer suchen …"
          autoComplete="off"
        />
      </label>
      {users.length > 0 ? (
        <div className="mention-suggestions" aria-label="Mögliche Nutzer">
          {selected.map((id) => {
            const user = users.find((item) => item.user_id === id);
            return user ? <button key={id} className="mention-chip selected" type="button" onClick={() => remove(id)}>@{user.display_name} ×</button> : null;
          })}
          {suggestions.map((user) => <button key={user.user_id} className="mention-chip" type="button" onClick={() => add(user.user_id)}>@{user.display_name}</button>)}
          {normalized && suggestions.length === 0 ? <small>Kein passender aktiver Nutzer.</small> : null}
        </div>
      ) : <small className="form-help">Keine weiteren aktiven Nutzer verfügbar.</small>}
    </div>
  );
}
