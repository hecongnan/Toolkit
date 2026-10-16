"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export function NoteBody({ body, expanded, onToggle }: { body: string; expanded: boolean; onToggle: () => void }) {
  const text = useRef<HTMLParagraphElement>(null);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const element = text.current;
    if (!element || expanded) return;
    const measure = () => setTruncated(body.length > 500 || element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [body, expanded]);
  return <div className="mt-4 min-w-0"><p ref={text} data-note-body className={"whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere] " + (expanded ? "" : "line-clamp-6")}>{expanded ? body : body.slice(0, 500)}</p>
    {(expanded || truncated) && <Button className="mt-2 max-w-full min-w-0" size="sm" variant="ghost" aria-expanded={expanded} onClick={onToggle}>{expanded ? "收起正文" : "展开全文"}</Button>}
  </div>;
}
