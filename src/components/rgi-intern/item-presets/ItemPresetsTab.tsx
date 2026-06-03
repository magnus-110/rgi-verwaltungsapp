import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Copy, Trash2, FileStack } from "lucide-react";
import { useRgiItemPresets, useDeleteRgiItemPreset, useUpsertRgiItemPreset, type RgiItemPreset } from "@/hooks/useRgi";
import { ItemPresetDialog } from "./ItemPresetDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ItemPresetsTab() {
  const { data: presets, isLoading } = useRgiItemPresets();
  const del = useDeleteRgiItemPreset();
  const upsert = useUpsertRgiItemPreset();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RgiItemPreset | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RgiItemPreset | null>(null);

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (p: RgiItemPreset) => { setEditing(p); setEditorOpen(true); };

  const duplicate = async (p: RgiItemPreset) => {
    await upsert.mutateAsync({
      name: `${p.name} (Kopie)`,
      sparte: p.sparte,
      items: (p.items as any) ?? [],
    });
  };

  const sumNet = (p: RgiItemPreset) => {
    const its = ((p.items as any) ?? []) as Array<{ quantity?: number; unit_price_net?: number }>;
    return its.reduce((s, it) => s + Number(it.quantity ?? 0) * Number(it.unit_price_net ?? 0), 0);
  };

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileStack className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold">Rechnungsvorlagen (Inhalte)</h3>
              <p className="text-xs text-muted-foreground">Wiederkehrende Positionen für Rechnungen — z.B. Verwaltergebühr, Eigentümerwechsel, Mietvertrag.</p>
            </div>
          </div>
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" />Neue Vorlage</Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Lade…</div>
        ) : (presets ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Noch keine Vorlagen. Lege eine an, um Positionen wiederzuverwenden.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Sparte</TableHead>
                <TableHead className="text-right">Positionen</TableHead>
                <TableHead className="text-right">Σ netto</TableHead>
                <TableHead className="w-[160px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {presets!.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.sparte ? <Badge variant="outline">{p.sparte}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right">{((p.items as any) ?? []).length}</TableCell>
                  <TableCell className="text-right font-mono">{sumNet(p).toFixed(2)} €</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)} title="Bearbeiten"><Edit className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => duplicate(p)} title="Duplizieren"><Copy className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(p)} title="Löschen"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ItemPresetDialog open={editorOpen} onOpenChange={setEditorOpen} preset={editing} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
            <AlertDialogDescription>"{confirmDelete?.name}" wird dauerhaft entfernt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { if (confirmDelete) { await del.mutateAsync(confirmDelete.id); setConfirmDelete(null); } }}
            >Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
