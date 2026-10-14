"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface MenuGroup { title: string; links: [label: string, href: string][] }

/**
 * Full-height navigation sheet for small screens. It is portalled to <body>: the header pill is a containing block for fixed
 * descendants (backdrop-filter / transforms), so a sheet rendered inside it would be sized to the pill, not the viewport.
 */
export function MobileMenu({ groups }: { groups: MenuGroup[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);
  return (
    <>
      <button type="button" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)} className="grid size-9 place-items-center rounded-ctl text-ink-2 transition-colors hover:bg-sunk hover:text-ink md:hidden">
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>
      {mounted && createPortal(
      <div
        id="mobile-nav"
        className={cn("fixed inset-x-0 bottom-0 top-[4.75rem] z-20 overflow-y-auto bg-ground px-5 pb-10 pt-6 transition-[opacity,translate] duration-[var(--duration-base)] ease-[var(--ease-out)] md:hidden", open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0")}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="grid gap-8">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="text-xs font-medium text-ink-3">{g.title}</p>
              <ul className="mt-2 divide-y divide-line">
                {g.links.map(([l, h]) => (
                  <li key={h}><Link href={h} onClick={() => setOpen(false)} className="block py-3 text-[1.125rem] font-medium tracking-[-0.02em] text-ink">{l}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>,
        document.body,
      )}
    </>
  );
}
