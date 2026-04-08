"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleItem } from "@/lib/modules";

type MainNavProps = {
  items: ModuleItem[];
};

export function MainNav({ items }: MainNavProps) {
  const pathname = usePathname();

  return (
    <nav className="app-card p-3 md:p-4">
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded-xl border px-3 py-3 transition-colors md:px-4 ${
                  active
                    ? "border-accent bg-surface-strong"
                    : "border-line bg-white hover:border-accent"
                }`}
              >
                <p className="text-sm font-semibold text-text-primary">{item.ko}</p>
                <p className="title-en text-xs">{item.en}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
