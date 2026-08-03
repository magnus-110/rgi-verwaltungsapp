import { useCallback, useRef, useState } from "react";

/**
 * Kleiner Helfer für Datei-Drop-Zonen.
 * Liefert `isOver` (für Highlight) und `dropProps` zum Spreaden auf ein Element.
 */
export function useFileDrop(onFiles: (files: FileList | null) => void, disabled = false) {
  const [isOver, setIsOver] = useState(false);
  const depth = useRef(0);

  const reset = useCallback(() => {
    depth.current = 0;
    setIsOver(false);
  }, []);

  const dropProps = {
    onDragEnter: (e: React.DragEvent) => {
      if (disabled) return;
      if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current += 1;
      setIsOver(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (disabled) return;
      if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: React.DragEvent) => {
      if (disabled) return;
      e.stopPropagation();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setIsOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (disabled) return;
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      reset();
      onFiles(files);
    },
  };

  return { isOver, dropProps };
}
