import ReactMarkdown from 'react-markdown';

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
        <div className="text-sm text-foreground leading-relaxed prose prose-sm max-w-none
          prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
          prose-p:my-1.5 prose-li:my-0.5 prose-strong:text-foreground prose-strong:font-semibold
          prose-ul:my-2 prose-ol:my-2" style={{ lineHeight: '1.8', letterSpacing: '0.01em' }}>
          <ReactMarkdown>{message.content}</ReactMarkdown>
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