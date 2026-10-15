import type { Todo } from "./types";

export function todoMatchesQuery(todo: Pick<Todo, "text" | "scheduledTime">, query: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase();
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const content = normalize(`${todo.text} ${todo.scheduledTime ?? ""}`);
  return terms.every((term) => content.includes(term));
}
