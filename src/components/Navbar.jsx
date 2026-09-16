"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

function NavLink({ href = "#", children }) {
  return (
    <Link href={href} className="nav-link-swap">
      <span className="nav-link-swap-track">
        <span className="nav-link-swap-text">{children}</span>
      </span>
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const isDark = pathname?.startsWith("/playground") || pathname?.startsWith("/about");

  return (
    <nav className={isDark ? "nav-dark" : ""}>
      <div className="nav-logo">
        <Link href="/">Creatica Crown</Link>
      </div>

      <p className="nav-tagline">Creative Marketing Agency</p>

      <div className="nav-links">
        <NavLink href="/about">About</NavLink>
        <NavLink href="/work">Work</NavLink>
        <NavLink href="/playground">Playground</NavLink>
        <NavLink>Contact</NavLink>
      </div>
    </nav>
  );
}
