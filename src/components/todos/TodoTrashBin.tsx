import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { useDeletedTodos, useRestoreTodo, useDeleteTodo } from "@/hooks/useTodos";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export function TodoTrashBin() {
  const { data: deletedTodos = [] } = useDeletedTodos();
  const restoreTodo = useRestoreTodo();
  const deleteTodo = useDeleteTodo();
  const [open, setOpen] = useState(false);

  const getDaysRemaining = (deletedAt: string) => {
    const deleteDate = new Date(deletedAt);
    const expiryDate = new Date(deleteDate);
    expiryDate.setDate(expiryDate.getDate() + 30);
    return Math.max(0, differenceInDays(expiryDate, new Date()));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="gap-2 relative">
          <Trash2 className="h-5 w-5" />
          <span>Papierkorb</span>
          {deletedTodos.length > 0 && (
            <Badge variant="destructive" className="ml-1 px-1.5 py-0.5 text-xs min-w-[20px]">
              {deletedTodos.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Papierkorb
          </DialogTitle>
        </DialogHeader>

        {deletedTodos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Der Papierkorb ist leer
          </p>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Aufgaben werden nach 30 Tagen endgültig gelöscht
            </p>
            {deletedTodos.map((todo) => {
              const daysLeft = getDaysRemaining(todo.deleted_at);
              return (
                <div key={todo.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{todo.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Gelöscht: {format(new Date(todo.deleted_at), "dd.MM.yyyy", { locale: de })}
                      {" · "}
                      <span className={daysLeft <= 5 ? "text-destructive font-medium" : ""}>
                        {daysLeft} Tage verbleibend
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => restoreTodo.mutate(todo.id)}
                      disabled={restoreTodo.isPending}
                      title="Wiederherstellen"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Endgültig löschen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Endgültig löschen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Diese Aufgabe wird unwiderruflich gelöscht und kann nicht wiederhergestellt werden.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteTodo.mutate(todo.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Endgültig löschen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
