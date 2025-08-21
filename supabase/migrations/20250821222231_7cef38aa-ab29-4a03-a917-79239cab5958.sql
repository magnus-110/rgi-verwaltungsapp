-- Simplify report templates table - remove unnecessary columns
ALTER TABLE public.report_templates 
DROP COLUMN description,
DROP COLUMN priority,
DROP COLUMN category;

-- Rename title to name for clarity
ALTER TABLE public.report_templates 
RENAME COLUMN title TO name;