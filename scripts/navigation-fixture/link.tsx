import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate } from "./navigation";

export default function Link({ href = "/", onNavigate, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & {
  onNavigate?: (event: { preventDefault: () => void }) => void;
}) {
  return <a {...props} href={href} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    let cancelled = false;
    onNavigate?.({ preventDefault: () => { cancelled = true; } });
    if (!cancelled) navigate(href);
  }} />;
}
