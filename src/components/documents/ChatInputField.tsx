import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Loader2, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PromptTemplateMenu } from "./PromptTemplateMenu";

interface ChatInputFieldProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  className?: string;
}

export function ChatInputField({
  onSend,
  isLoading,
  disabled,
  className,
}: ChatInputFieldProps) {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${newHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'de-DE';

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        setValue(transcript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        if (event.error === 'not-allowed') {
          toast({
            title: "Mikrofon-Zugriff verweigert",
            description: "Bitte erlauben Sie den Zugriff auf das Mikrofon in Ihren Browser-Einstellungen.",
            variant: "destructive",
          });
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [toast]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast({
        title: "Nicht unterstützt",
        description: "Spracherkennung wird von Ihrem Browser nicht unterstützt.",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (error) {
        console.error('Failed to start recognition:', error);
      }
    }
  };

  const handleSend = () => {
    if (!value.trim() || isLoading || disabled) return;
    onSend(value.trim());
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasSpeechRecognition = typeof window !== 'undefined' && 
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <div className={cn("w-full max-w-3xl mx-auto px-4", className)}>
      <div className="relative flex items-end gap-2 rounded-full border border-border bg-muted/50 shadow-sm px-4 py-2">
        {/* Prompt Template Menu */}
        <PromptTemplateMenu 
          onSelectPrompt={(content) => setValue(content)}
          disabled={isLoading || disabled}
        />
        
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Stellen Sie eine Frage..."
          disabled={isLoading || disabled}
          rows={1}
          className={cn(
            "flex-1 resize-none bg-transparent py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "min-h-[40px] max-h-[200px]"
          )}
        />
        
        {/* Voice Input Button */}
        {hasSpeechRecognition && (
          <Button
            type="button"
            onClick={toggleListening}
            disabled={isLoading || disabled}
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 rounded-full flex-shrink-0",
              isListening && "text-destructive bg-destructive/10"
            )}
          >
            {isListening ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        )}
        
        {/* Send Button */}
        <Button
          onClick={handleSend}
          disabled={!value.trim() || isLoading || disabled}
          size="icon"
          className="h-9 w-9 rounded-full flex-shrink-0"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
