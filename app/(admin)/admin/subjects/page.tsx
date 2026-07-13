import { requireAdmin } from "@/lib/auth/current";
import { listSubjectsWithCounts } from "@/lib/queries/subjects";
import { SubjectList } from "@/components/admin/subject-list";
import { CreateSubjectDialog } from "@/components/admin/create-subject-dialog";

export const dynamic = "force-dynamic";

export default async function SubjectsPage() {
  await requireAdmin();
  const rows = await listSubjectsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const totalTasks = rows.reduce((sum, r) => sum + r.taskCount, 0);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <span
            className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
            style={{ fontFamily: "var(--font-mono-display)" }}
          >
            Admin · Workflow & Data
          </span>
          <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
            Subjects
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] text-[#6b7280] tabular-nums">
            {rows.length} total · {activeCount} active · {totalTasks} tasks mapped
          </p>
        </div>
        <div className="mt-1">
          <CreateSubjectDialog />
        </div>
      </header>
      <SubjectList subjects={rows} />
    </div>
  );
}
