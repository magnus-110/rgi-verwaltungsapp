-- Create chatbot_messages table to store conversation history
CREATE TABLE public.chatbot_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.chatbot_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  building_id UUID,
  management_mode app_role NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add ended_at to chatbot_sessions for completed sessions
ALTER TABLE public.chatbot_sessions 
ADD COLUMN ended_at TIMESTAMP WITH TIME ZONE;

-- Enable RLS
ALTER TABLE public.chatbot_messages ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX idx_chatbot_messages_session_created ON public.chatbot_messages(session_id, created_at);
CREATE INDEX idx_chatbot_messages_user_created ON public.chatbot_messages(user_id, created_at DESC);

-- RLS Policies for chatbot_messages
CREATE POLICY "Admin can view all messages" ON public.chatbot_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can view their own messages" ON public.chatbot_messages
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own messages" ON public.chatbot_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Update chatbot_sessions policies to allow ending sessions
CREATE POLICY "Users can update their own sessions" ON public.chatbot_sessions
  FOR UPDATE USING (user_id = auth.uid());