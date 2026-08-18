import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/current";
import { listBoardCards } from "@/lib/queries/board";
import { BOARD_MODULES } from "@/lib/board/registry";
import { StageBoard } from "@/components/board/stage-board";

export const dynamic = "force-dynamic";

const MODULE = "feasibility" as const;

/**
 * feasibility stage board — the module's status buckets as Kanban columns.
 *
 * Everything about it (columns, labels, tones) comes from the shared registry,
 * so this page is a data fetch and a heading. The rules that matter — a remark
 * on every move, the approval gate on the approved columns — live in
 * StageBoard and moveOnBoard, once, for every stage.
 */
export default async function BoardPage() {
  await requireUser();
  const cfg = BOARD_MODULES[MODULE];
  const cards = await listBoardCards(MODULE);

  return (
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-[19px] font-black leading-none tracking-tight text-[#3f3f94]">
            {cfg.title}
          </h1>
          <span className="text-[12.5px] font-semibold tabular-nums text-[#6b7280]">
            {cards.length} {cards.length === 1 ? cfg.unit : `${cfg.unit}s`}
          </span>
          <Link
            href={cfg.registerHref as Route}
            className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink-strong"
          >
            <ArrowLeft size={14} strokeWidth={2.4} />
            Open register
          </Link>
        </header>

        <StageBoard
          module={MODULE}
          cards={cards}
          buckets={cfg.buckets}
          labels={cfg.labels}
          tones={cfg.tones}
          unit={cfg.unit}
        />
      </div>
  );
}
