-- Create table for chatbot knowledge documents
CREATE TABLE public.chatbot_knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  management_mode public.management_mode NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'sonstiges',
  keywords TEXT[] DEFAULT '{}',
  applies_to TEXT NOT NULL DEFAULT 'alle',
  file_path TEXT,
  page_count INTEGER,
  char_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add constraint for valid categories
ALTER TABLE public.chatbot_knowledge_documents 
  ADD CONSTRAINT valid_category 
  CHECK (category IN ('mietvertrag', 'hausordnung', 'rechtliches', 'faq', 'sonstiges'));

-- Add constraint for valid applies_to values
ALTER TABLE public.chatbot_knowledge_documents 
  ADD CONSTRAINT valid_applies_to 
  CHECK (applies_to IN ('alle', 'mieter', 'weg_eigentuemer'));

-- Enable Row Level Security
ALTER TABLE public.chatbot_knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Create policy for admin access (read/write)
CREATE POLICY "Admins can manage knowledge documents" 
ON public.chatbot_knowledge_documents 
FOR ALL 
USING (public.user_has_admin_access(auth.uid()));

-- Create policy for service role (for edge functions)
CREATE POLICY "Service role can manage knowledge documents"
ON public.chatbot_knowledge_documents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_chatbot_knowledge_documents_updated_at
  BEFORE UPDATE ON public.chatbot_knowledge_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster keyword search
CREATE INDEX idx_chatbot_knowledge_keywords ON public.chatbot_knowledge_documents USING GIN(keywords);

-- Create index for category and applies_to
CREATE INDEX idx_chatbot_knowledge_category ON public.chatbot_knowledge_documents(category, applies_to);

-- Create index for management_mode
CREATE INDEX idx_chatbot_knowledge_mode ON public.chatbot_knowledge_documents(management_mode);

-- Comment the table
COMMENT ON TABLE public.chatbot_knowledge_documents IS 'Stores knowledge documents for the chatbot with metadata for intelligent search';