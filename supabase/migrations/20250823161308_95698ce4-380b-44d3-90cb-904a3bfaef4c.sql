-- Create chatbot_sessions table for tracking conversations
CREATE TABLE public.chatbot_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  management_mode management_mode NOT NULL,
  building_id UUID,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for chatbot_sessions
CREATE POLICY "Admins can view all chatbot sessions" 
ON public.chatbot_sessions 
FOR SELECT 
USING (get_user_role(auth.uid()) = 'admin'::app_role);

CREATE POLICY "Users can create their own sessions" 
ON public.chatbot_sessions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own sessions" 
ON public.chatbot_sessions 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_chatbot_sessions_started_at ON public.chatbot_sessions(started_at);
CREATE INDEX idx_chatbot_sessions_management_mode ON public.chatbot_sessions(management_mode);
CREATE INDEX idx_chatbot_sessions_user_id ON public.chatbot_sessions(user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_chatbot_sessions_updated_at
BEFORE UPDATE ON public.chatbot_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();