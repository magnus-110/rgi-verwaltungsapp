import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div className={cn("w-full max-w-3xl mx-auto px-4", className)}>
      <div className="relative flex items-end gap-2 rounded-2xl border border-border bg-card shadow-sm p-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Stellen Sie eine Frage..."
          disabled={isLoading || disabled}
          rows={1}
          className={cn(
            "flex-1 resize-none bg-transparent px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "min-h-[40px] max-h-[200px]"
          )}
        />
        <Button
          onClick={handleSend}
          disabled={!value.trim() || isLoading || disabled}
          size="icon"
          className="h-9 w-9 rounded-xl flex-shrink-0"
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
