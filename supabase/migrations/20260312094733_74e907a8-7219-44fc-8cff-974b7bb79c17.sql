-- Add deleted_at column for soft-delete trash bin
ALTER TABLE public.todos ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL;

-- Create index for efficient filtering of non-deleted todos
CREATE INDEX idx_todos_deleted_at ON public.todos (deleted_at) WHERE deleted_at IS NOT NULL;