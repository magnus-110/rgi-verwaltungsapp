interface ChatMessageProps {
  message: {
    id: string;
    content: string;
    isBot: boolean;
    timestamp: Date;
  };
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  return (
    <div className="p-4 max-w-3xl mx-auto">
      {message.isBot ? (
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap" style={{ lineHeight: '1.8', letterSpacing: '0.01em' }}>
          {message.content}
        </div>
      ) : (
        <div className="flex justify-end mb-4">
          <div className="bg-muted px-4 py-2 rounded-2xl max-w-xs text-sm text-foreground">
            {message.content}
          </div>
        </div>
      )}
    </div>
  );
};