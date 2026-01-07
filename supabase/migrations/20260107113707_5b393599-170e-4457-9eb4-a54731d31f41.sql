-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Table: building_documents (stores uploaded document metadata)
CREATE TABLE public.building_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('building', 'general')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  page_count INTEGER,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'ready', 'error')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table: document_chunks (stores processed text chunks with embeddings)
CREATE TABLE public.document_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.building_documents(id) ON DELETE CASCADE,
  building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('building', 'general')),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding vector(1024),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table: document_chat_sessions (stores chat sessions)
CREATE TABLE public.document_chat_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  include_general BOOLEAN NOT NULL DEFAULT true,
  search_scope TEXT NOT NULL DEFAULT 'all' CHECK (search_scope IN ('all', 'building', 'general')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table: document_chat_messages (stores chat messages)
CREATE TABLE public.document_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.document_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.building_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for building_documents
CREATE POLICY "Admins can manage building documents"
  ON public.building_documents
  FOR ALL
  USING (get_user_role(auth.uid()) = 'admin'::app_role);

-- RLS Policies for document_chunks
CREATE POLICY "Admins can manage document chunks"
  ON public.document_chunks
  FOR ALL
  USING (get_user_role(auth.uid()) = 'admin'::app_role);

-- RLS Policies for document_chat_sessions
CREATE POLICY "Admins can manage chat sessions"
  ON public.document_chat_sessions
  FOR ALL
  USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Users can manage their own sessions"
  ON public.document_chat_sessions
  FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for document_chat_messages
CREATE POLICY "Admins can manage chat messages"
  ON public.document_chat_messages
  FOR ALL
  USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Users can manage messages in their sessions"
  ON public.document_chat_messages
  FOR ALL
  USING (
    session_id IN (
      SELECT id FROM public.document_chat_sessions WHERE user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX idx_document_chunks_building_id ON public.document_chunks(building_id);
CREATE INDEX idx_document_chunks_category ON public.document_chunks(category);
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_building_documents_building_id ON public.building_documents(building_id);
CREATE INDEX idx_building_documents_category ON public.building_documents(category);
CREATE INDEX idx_building_documents_status ON public.building_documents(status);
CREATE INDEX idx_document_chat_sessions_user_id ON public.document_chat_sessions(user_id);
CREATE INDEX idx_document_chat_messages_session_id ON public.document_chat_messages(session_id);

-- Create HNSW index for vector similarity search
CREATE INDEX idx_document_chunks_embedding ON public.document_chunks 
USING hnsw (embedding vector_cosine_ops);

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('building-documents', 'building-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for building-documents bucket
CREATE POLICY "Admins can upload documents"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'building-documents' AND get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Admins can view documents"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'building-documents' AND get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Admins can delete documents"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'building-documents' AND get_user_role(auth.uid()) = 'admin'::app_role);

-- Trigger for updated_at
CREATE TRIGGER update_building_documents_updated_at
  BEFORE UPDATE ON public.building_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_document_chat_sessions_updated_at
  BEFORE UPDATE ON public.document_chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();