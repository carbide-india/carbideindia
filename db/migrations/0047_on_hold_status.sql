-- Manan 2026-06 — add the "On Hold" task status (amber). A paused / blocked
-- task that is still open: it counts as pending (not done, not terminal) and
-- can be set from inside a task. Idempotent.
--
-- The apply-all-migrations runner splits the `ALTER TYPE ... ADD VALUE` out
-- and runs it on its own (outside a transaction) before the rest below, so
-- the new value is committed and usable by steps 2 + 3.

-- 1. New enum value (run standalone by the applier).
alter type task_status add value if not exists 'on_hold';

-- 2. Fold on_hold into the pending partial index so pending-task queries stay
--    index-backed (mirrors how dont_know was added in 0024).
drop index if exists tasks_pending_created_idx;
create index if not exists tasks_pending_created_idx
  on tasks (created_at)
  where status in (
    'dont_know','not_started','initiated','follow_up','need_help',
    'need_info','follow_up_1','follow_up_2','follow_up_3','on_hold'
  );

-- 3. Seed the admin-editable status_settings row so the label/colour are
--    authoritative + reorderable in admin settings.
insert into status_settings (status, label, color_token, display_order)
values ('on_hold', 'On Hold', 'amber', 85)
on conflict (status) do nothing;
