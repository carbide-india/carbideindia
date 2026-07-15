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
  ArrowRight,
  LayoutList,
  type LucideIcon,
} from "lucide-react";

/**
 * FORMS launcher - replaces the Enquiries nav pill (Phase 3, Task 5).
 *
 * A nav-pill-styled BUTTON (visually identical to MainNavPill) that opens a
 * drafting-sheet modal indexing every form in the sales pipeline: six live
 * forms (Enquiry, Client KYC, Sample Register, Quotation, Negotiation,
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
  "/costings",
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
    name: "Client KYC",
    Icon: BadgeCheck,
    desc: "Onboard a client - types, address, contact, meeting.",
    href: "/clients/new" as Route,
    registerHref: "/clients" as Route,
  },
  {
    name: "Sample Register",
    Icon: FlaskConical,
    desc: "Track a physical sample through its stages.",
    href: "/samples/new" as Route,
    registerHref: "/samples" as Route,
  },
  {
    name: "Enquiry",
    Icon: FileSearch,
    desc: "Log a new sales enquiry - SM number auto-assigned.",
    href: "/enquiries/new" as Route,
    registerHref: "/inquiries" as Route,
  },
  {
    name: "Quotation",
    Icon: FileText,
    desc: "Build a quote from an SM - pricing, timeline, validity.",
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
    desc: "Log a client visit - sales, contact and outcome.",
    href: "/meetings/new" as Route,
    registerHref: "/meetings" as Route,
  },
  {
    name: "Costing",
    Icon: Calculator,
    desc: "In-house or bought-out cost sheet with live estimate.",
    href: "/costings/new" as Route,
    registerHref: "/costings" as Route,
  },
];

const DISABLED_CARDS: DisabledCard[] = [];

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
          className="fixed left-1/2 top-1/2 z-[100] max-h-[90vh] w-[min(1120px,calc(100vw-48px))] max-w-[1120px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-8 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 max-md:p-5"
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
              transition: border-color 220ms ease, box-shadow 220ms ease;
            }
            .fl-card-active:hover,
            .fl-card-active:focus-within {
              border-color: color-mix(in srgb, var(--color-brand) 55%, transparent);
              box-shadow: 0 10px 28px -16px color-mix(in srgb, var(--color-brand) 55%, transparent);
            }

            /* Glossy, animated card buttons */
            .fl-btn {
              position: relative;
              overflow: hidden;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              height: 38px;
              padding: 0 14px;
              border-radius: 10px;
              font-size: 12.5px;
              font-weight: 700;
              letter-spacing: 0.005em;
              white-space: nowrap;
              cursor: pointer;
              transition: transform 200ms cubic-bezier(0.22,1,0.36,1),
                          box-shadow 200ms ease, background-color 200ms ease,
                          border-color 200ms ease, color 200ms ease;
            }
            .fl-btn:active { transform: translateY(0) scale(0.99); }
            .fl-arrow { transition: transform 200ms cubic-bezier(0.22,1,0.36,1); }
            .fl-btn:hover .fl-arrow { transform: translateX(3px); }

            .fl-btn-primary {
              color: #fff;
              background: linear-gradient(135deg, var(--color-brand), var(--color-brand-deep));
              box-shadow: 0 1px 0 rgba(255,255,255,0.28) inset,
                          0 6px 16px -7px color-mix(in srgb, var(--color-brand) 65%, transparent);
            }
            .fl-btn-primary:hover {
              transform: translateY(-1.5px);
              box-shadow: 0 1px 0 rgba(255,255,255,0.35) inset,
                          0 12px 24px -8px color-mix(in srgb, var(--color-brand) 75%, transparent);
            }
            /* Diagonal sheen sweep on hover */
            .fl-btn-primary::before {
              content: "";
              position: absolute;
              inset: 0;
              background: linear-gradient(120deg, transparent 28%, rgba(255,255,255,0.45) 50%, transparent 72%);
              transform: translateX(-130%);
              transition: transform 650ms ease;
              pointer-events: none;
            }
            .fl-btn-primary:hover::before { transform: translateX(130%); }

            .fl-btn-ghost {
              color: var(--color-brand);
              background: #fff;
              border: 1px solid color-mix(in srgb, var(--color-brand) 32%, transparent);
              box-shadow: 0 1px 2px rgba(30,36,71,0.04);
            }
            .fl-btn-ghost:hover {
              transform: translateY(-1.5px);
              background: color-mix(in srgb, var(--color-brand) 8%, white);
              border-color: var(--color-brand);
              box-shadow: 0 8px 18px -10px color-mix(in srgb, var(--color-brand) 55%, transparent);
            }

            @media (prefers-reduced-motion: reduce) {
              .fl-rise { animation: none; opacity: 1; }
              .fl-card-active:hover,
              .fl-card-active:focus-within { box-shadow: none; }
              .fl-btn, .fl-btn:hover, .fl-btn:active { transform: none; }
              .fl-btn-primary::before { display: none; }
              .fl-arrow, .fl-btn:hover .fl-arrow { transition: none; transform: none; }
            }
          `}</style>

          {/* ── Sheet header - DWG eyebrow, title, subtitle ── */}
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

          {/* ── Card grid - wide, 3 columns ── */}
          <div className="mt-6 grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
            {ACTIVE_CARDS.map(({ name, Icon, desc, href, registerHref }, i) => (
              <div
                key={name}
                className="fl-rise fl-card-active relative flex flex-col rounded-xl border border-hairline bg-white p-5"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <IconSquare Icon={Icon} />
                <h3 className="mt-3 text-[15px] font-bold leading-snug text-ink-strong">
                  {name}
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-subtle">{desc}</p>
                {/* Two glossy, animated actions: open the form, or jump to its register. */}
                <div className="mt-4 flex items-stretch gap-2">
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className="fl-btn fl-btn-primary flex-1"
                    aria-label={`Open the ${name} form`}
                  >
                    Open form
                    <ArrowRight className="fl-arrow" size={14} strokeWidth={2.6} />
                  </Link>
                  <Link
                    href={registerHref}
                    onClick={() => setOpen(false)}
                    className="fl-btn fl-btn-ghost"
                    aria-label={`View the ${name} register`}
                  >
                    <LayoutList size={14} strokeWidth={2.3} />
                    Register
                  </Link>
                </div>
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
