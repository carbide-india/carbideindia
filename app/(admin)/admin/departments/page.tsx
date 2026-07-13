import { requireAdmin } from "@/lib/auth/current";
import { listDepartmentsWithCounts } from "@/lib/queries/departments";
import { DepartmentList } from "@/components/admin/department-list";
import { CreateDepartmentDialog } from "@/components/admin/create-department-dialog";

export const dynamic = "force-dynamic";

export default async function DepartmentsPage() {
  await requireAdmin();
  const rows = await listDepartmentsWithCounts();
  const activeCount = rows.filter((r) => r.isActive).length;
  const totalEmployees = rows.reduce((sum, r) => sum + r.employeeCount, 0);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <span
            className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#a2a8b4]"
            style={{ fontFamily: "var(--font-mono-display)" }}
          >
            Admin · People & Access
          </span>
          <h1 className="mt-1.5 text-[30px] font-extrabold leading-tight tracking-tight text-[#1e2f66]">
            Departments
          </h1>
          <p className="mt-2 max-w-2xl text-[14px] text-[#6b7280] tabular-nums">
            {rows.length} total · {activeCount} active · {totalEmployees} employees mapped
          </p>
        </div>
        <div className="mt-1">
          <CreateDepartmentDialog />
        </div>
      </header>
      <DepartmentList departments={rows} />
    </div>
  );
}
