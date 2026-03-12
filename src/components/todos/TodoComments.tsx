import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, MessageSquare, Pencil, X, Check, Trash2 } from "lucide-react";
import { useComments, useCreateComment, useUpdateComment, useDeleteComment, TodoComment } from "@/hooks/useTodos";
import { useAuth } from "@/hooks/useAuth";
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

      {comments.length > 0 && (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} todoId={todoId} readOnly={readOnly} />
          ))}
        </div>
      )}

      {comments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">
          Noch keine Kommentare
        </p>
      )}

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

function CommentItem({ comment, todoId, readOnly }: { comment: TodoComment; todoId: string; readOnly?: boolean }) {
  const { user } = useAuth();
  const updateComment = useUpdateComment();
  const deleteComment = useDeleteComment();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);

  const isOwner = user?.id === comment.created_by;

  const handleSave = () => {
    if (!editContent.trim()) return;
    updateComment.mutate(
      { id: comment.id, todoId, content: editContent.trim() },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  const handleDelete = () => {
    deleteComment.mutate({ id: comment.id, todoId });
  };

  const userName = comment.user 
    ? `${comment.user.first_name || ''} ${comment.user.last_name || ''}`.trim() || comment.user.email
    : 'Unbekannt';

  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{userName}</span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {format(new Date(comment.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
          </span>
          {isOwner && !readOnly && !isEditing && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => { setEditContent(comment.content); setIsEditing(true); }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={deleteComment.isPending}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[50px] resize-none text-sm"
            autoFocus
          />
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsEditing(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" className="h-7 w-7" onClick={handleSave} disabled={!editContent.trim() || updateComment.isPending}>
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
      )}
    </div>
  );
}
