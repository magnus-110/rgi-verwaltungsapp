import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, MessageSquare } from "lucide-react";
import { useComments, useCreateComment, TodoComment } from "@/hooks/useTodos";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface TodoCommentsProps {
  todoId: string;
  readOnly?: boolean;
}

export function TodoComments({ todoId, readOnly = false }: TodoCommentsProps) {
  const { data: comments = [], isLoading } = useComments(todoId);
  const createComment = useCreateComment();
  const [newComment, setNewComment] = useState("");

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    createComment.mutate({ todoId, content: newComment.trim() });
    setNewComment("");
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Laden...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">
          Kommentare {comments.length > 0 && <span className="text-muted-foreground">({comments.length})</span>}
        </h4>
      </div>

      {/* Comments list */}
      {comments.length > 0 && (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}

      {comments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">
          Noch keine Kommentare
        </p>
      )}

      {/* Add comment */}
      {!readOnly && (
        <div className="flex gap-2">
          <Textarea
            placeholder="Kommentar schreiben..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[60px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!newComment.trim() || createComment.isPending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function CommentItem({ comment }: { comment: TodoComment }) {
  const userName = comment.user 
    ? `${comment.user.first_name || ''} ${comment.user.last_name || ''}`.trim() || comment.user.email
    : 'Unbekannt';

  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{userName}</span>
        <span className="text-xs text-muted-foreground">
          {format(new Date(comment.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
    </div>
  );
}
