import { Suspense, type ReactNode } from "react";
import { PipelineShell } from "@/components/pipeline/pipeline-shell";
import { UserMenuServer } from "@/components/header/user-menu-server";

export default function PipelineLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <PipelineShell userMenu={<UserMenuServer />}>{children}</PipelineShell>
    </Suspense>
  );
}
