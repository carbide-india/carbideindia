"use client";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListTodo, CalendarDays, FolderKanban, SquareKanban, CalendarCheck, Boxes, Layers, Building2 } from "lucide-react";
import type { Route } from "next";
import { MainNavPill } from "./main-nav-pill";
import { FormsLauncher } from "./forms-launcher";

interface Props {
  activeTasks: number;
  isAdmin: boolean;
  variant?: "drawer";
}

export function MainNav({ activeTasks, isAdmin, variant }: Props) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      aria-label="Primary"
      className={
        variant === "drawer"
          ? "flex flex-col gap-1.5 w-full"
          : "flex items-center gap-1 2xl:gap-1.5 max-md:gap-1"
      }
    >
      <MainNavPill
        href={"/" as Route}
        label="Dashboard"
        Icon={LayoutDashboard}
        active={isActive("/")}
        variant={variant}      />
      <MainNavPill
        href={"/tasks/agenda" as Route}
        label="My Day"
        Icon={CalendarDays}
        active={isActive("/tasks/agenda")}
        variant={variant}      />
      <MainNavPill
        href={"/tasks" as Route}
        label="Tasks"
        Icon={ListTodo}
        active={
          isActive("/tasks") &&
          !pathname.startsWith("/tasks/agenda") &&
          !pathname.startsWith("/tasks/kanban")
        }
        count={activeTasks}
        variant={variant}      />
      {/* Forms — a button-pill opening the launcher modal (Enquiries,
          KYC, Samples + Phase-4 placeholders). Register list stays at
          /inquiries, reachable from the modal + ⌘K. */}
      <FormsLauncher variant={variant} />
      {/* Item Master — first-class register pill (was only in the Forms modal). */}
      <MainNavPill
        href={"/items" as Route}
        label="Item Master"
        Icon={Boxes}
        active={isActive("/items")}
        variant={variant}
      />
      {/* Client Master — admin-only roster of clients. */}
      {isAdmin && (
        <MainNavPill
          href={"/admin/clients" as Route}
          label="Client Master"
          Icon={Building2}
          active={isActive("/admin/clients")}
          variant={variant}
        />
      )}
      {/* Masters hub — admin-only (master data drives every form's dropdowns). */}
      {isAdmin && (
        <MainNavPill
          href={"/masters" as Route}
          label="Masters"
          Icon={Layers}
          active={isActive("/masters")}
          variant={variant}
        />
      )}
      {/* Kanban is an admin-only board — hidden from doers. */}
      {isAdmin && (
        <MainNavPill
          href={"/tasks/kanban" as Route}
          label="Kanban"
          Icon={SquareKanban}
          active={pathname.startsWith("/tasks/kanban")}
          variant={variant}
        />
      )}
      <MainNavPill
        href={"/projects" as Route}
        label="Projects"
        Icon={FolderKanban}
        active={isActive("/projects")}
        variant={variant}      />
      {/* Documents / Archived / Inbox live in the user menu. */}
      <MainNavPill
        href={"/attendance" as Route}
        label="Attendance"
        Icon={CalendarCheck}
        active={isActive("/attendance")}
        variant={variant}      />
    </nav>
  );
}
