
-- Add is_internal column to todos (default false = visible to employees)
ALTER TABLE public.todos ADD COLUMN is_internal boolean NOT NULL DEFAULT false;

-- Set existing tasks that are assigned ONLY to admins as internal
-- Logic: tasks where assigned_to is an admin AND no employee assignees exist
UPDATE public.todos t
SET is_internal = true
WHERE t.created_by IN (
  SELECT user_id FROM public.profiles WHERE role = 'admin'
)
AND (
  -- Legacy: assigned_to is an admin or null with no multi-assignees
  t.assigned_to IS NULL OR t.assigned_to IN (SELECT user_id FROM public.profiles WHERE role = 'admin')
)
AND NOT EXISTS (
  -- No employee in multi-assignees
  SELECT 1 FROM public.todo_assignees ta
  JOIN public.profiles p ON p.user_id = ta.user_id
  WHERE ta.todo_id = t.id AND p.role = 'employee'
);
