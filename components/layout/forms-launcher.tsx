"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  FilePlus2,
  FileSearch,
  BadgeCheck,
  FlaskConical,
  Calculator,
  FileText,
  Handshake,
  PackageCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

/**
 * FORMS launcher — replaces the Enquiries nav pill (Phase 3, Task 5).
 *
 * A nav-pill-styled BUTTON (visually identical to MainNavPill) that opens a
 * drafting-sheet modal indexing every form in the sales pipeline: six live
 * forms (First Enquiry, Client KYC, Sample Register, Quotation, Negotiation,
 * Sales Order) and one Phase-5 placeholder (Costing). Each live card is a real
 * <Link> that closes the dialog on click; registers are reachable via a small
 * secondary link per card.
 */

const RED = "#D32F2F";
const NAVY = "#1E2447";
const MONO = "var(--font-mono-display, ui-monospace, monospace)";

/** Pill lights up while the user is anywhere inside a forms surface. */
const ACTIVE_PREFIXES = [
  "/inquiries",
  "/samples",
  "/clients/new",
  "/quotations",
  "/negotiations",
  "/sales-orders",
  "/meetings",
] as const;

interface ActiveCard {
  name: string;
  Icon: LucideIcon;
  desc: string;
  href: Route;
  registerHref: Route;
}

interface DisabledCard {
  name: string;
  Icon: LucideIcon;
  desc: string;
}

const ACTIVE_CARDS: ActiveCard[] = [
  {
    name: "First Enquiry",
    Icon: FileSearch,
    desc: "Log a new sales enquiry — SM number auto-assigned.",
    href: "/inquiries/new" as Route,
    registerHref: "/inquiries" as Route,
  },
  {
    name: "Client KYC",
    Icon: BadgeCheck,
    desc: "Onboard a client — types, address, contact, meeting.",
    href: "/clients/new" as Route,
    registerHref: "/admin/clients" as Route,
  },
  {
    name: "Sample Register",
    Icon: FlaskConical,
    desc: "Track a physical sample through its stages.",
    href: "/samples/new" as Route,
    registerHref: "/samples" as Route,
  },
  {
    name: "Quotation",
    Icon: FileText,
    desc: "Build a quote from an SM — pricing, timeline, validity.",
    href: "/quotations/new" as Route,
    registerHref: "/quotations" as Route,
  },
  {
    name: "Negotiation",
    Icon: Handshake,
    desc: "Track price negotiation through to won or lost.",
    href: "/negotiations/new" as Route,
    registerHref: "/negotiations" as Route,
  },
  {
    name: "Sales Order",
    Icon: PackageCheck,
    desc: "Record the customer PO and the sales-order docs.",
    href: "/sales-orders/new" as Route,
    registerHref: "/sales-orders" as Route,
  },
  {
    name: "Daily Meeting",
    Icon: UserCheck,
    desc: "Log a client visit — sales, contact and outcome.",
    href: "/meetings/new" as Route,
    registerHref: "/meetings" as Route,
  },
];

const DISABLED_CARDS: DisabledCard[] = [
  {
    name: "Costing",
    Icon: Calculator,
    desc: "BU/BO and in-house sheets with auto weight calcs.",
  },
];

function IconSquare({ Icon }: { Icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
      style={{
        background: "color-mix(in srgb, var(--color-brand) 10%, transparent)",
        color: "var(--color-brand)",
      }}
    >
      <Icon size={20} strokeWidth={2} />
    </span>
  );
}

export function FormsLauncher({ variant }: { variant?: "drawer" }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const active = ACTIVE_PREFIXES.some((p) => pathname.startsWith(p));

  // Safety net: any route change (link click, back button while open)
  // dismisses the modal so it never lingers over the next page.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title="Forms"
          aria-haspopup="dialog"
          className={
            (active ? "nav-pill nav-pill-active" : "nav-pill") +
            " cursor-pointer" +
            (variant === "drawer" ? " w-full justify-start" : "")
          }
        >
          <FilePlus2 size={16} strokeWidth={2.2} />
          {/* Same icon-only collapse below xl as MainNavPill. */}
          <span className={variant === "drawer" ? "" : "max-xl:hidden"}>Forms</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90] data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{ background: "rgba(15,23,42,0.40)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] max-h-[88vh] w-[min(672px,calc(100vw-32px))] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 max-md:p-5"
          style={{
            border: "1px solid #E7E2DA",
            boxShadow: "0 2px 10px rgba(30,36,71,0.08)",
          }}
        >
          <style>{`
            @keyframes flRise {
              from { opacity: 0; transform: translateY(8px); }
              to   { opacity: 1; transform: none; }
            }
            .fl-rise {
              opacity: 0;
              animation: flRise 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
            }
            .fl-card-active {
              transition: border-color 200ms ease, transform 200ms ease;
              cursor: pointer;
            }
            .fl-card-active:hover,
            .fl-card-active:focus-within {
              border-color: var(--color-brand);
              transform: translateY(-2px);
            }
            @media (prefers-reduced-motion: reduce) {
              .fl-rise { animation: none; opacity: 1; }
              .fl-card-active:hover,
              .fl-card-active:focus-within { transform: none; }
            }
          `}</style>

          {/* ── Sheet header — DWG eyebrow, title, subtitle ── */}
          <div className="flex items-center gap-3">
            <span aria-hidden style={{ width: 28, height: 2, background: RED, display: "inline-block" }} />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: RED,
              }}
            >
              DWG Index · Forms
            </span>
          </div>
          <Dialog.Title
            className="mt-3"
            style={{
              fontFamily: "var(--font-display), var(--font-sans), sans-serif",
              fontWeight: 800,
              fontSize: 24,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: NAVY,
            }}
          >
            Start a form
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13.5px] leading-relaxed text-ink-subtle">
            Every entry lands in its register with an SM-linked trail.
          </Dialog.Description>

          {/* ── Card grid — 3 live, 3 Phase-4 placeholders ── */}
          <div className="mt-5 grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {ACTIVE_CARDS.map(({ name, Icon, desc, href, registerHref }, i) => (
              <div
                key={name}
                className="fl-rise fl-card-active relative rounded-xl border border-hairline bg-white p-5"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <IconSquare Icon={Icon} />
                <h3 className="mt-3 text-[15px] font-bold leading-snug text-ink-strong">
                  {/* Stretched link — the whole card is clickable; the
                      register link below sits above it on its own layer. */}
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className="outline-none after:absolute after:inset-0 after:rounded-xl"
                  >
                    {name}
                  </Link>
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-subtle">{desc}</p>
                <Link
                  href={registerHref}
                  onClick={() => setOpen(false)}
                  className="relative z-[1] mt-3 inline-flex items-center text-[12.5px] font-semibold hover:underline"
                  style={{ color: "var(--color-brand)" }}
                >
                  View register →
                </Link>
              </div>
            ))}
            {DISABLED_CARDS.map(({ name, Icon, desc }, i) => (
              <div
                key={name}
                aria-disabled="true"
                className="fl-rise relative cursor-not-allowed rounded-xl border border-hairline bg-white p-5 opacity-50"
                style={{ animationDelay: `${(ACTIVE_CARDS.length + i) * 0.05}s` }}
              >
                <span
                  className="absolute right-4 top-4"
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    color: "#78716C",
                  }}
                >
                  Phase 5
                </span>
                <IconSquare Icon={Icon} />
                <h3 className="mt-3 text-[15px] font-bold leading-snug text-ink-strong">{name}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-subtle">{desc}</p>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
