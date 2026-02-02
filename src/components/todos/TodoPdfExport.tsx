import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Todo, TodoFilters, priorityLabels, statusLabels, isOverdue } from '@/hooks/useTodos';
import { supabase } from '@/integrations/supabase/client';

interface ExportOptions {
  includeSubtasks: boolean;
  includeComments: boolean;
}

export async function exportToPdf(
  todos: Todo[], 
  filters: TodoFilters,
  options: ExportOptions
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Load logo
  try {
    const logoImg = await loadImage('/lovable-uploads/8c5a36ed-b686-4ac4-a6ec-5f337fd466b7.png');
    doc.addImage(logoImg, 'PNG', 15, 10, 40, 18);
  } catch (e) {
    console.warn('Could not load logo:', e);
  }

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('AUFGABENÜBERSICHT', pageWidth / 2, 25, { align: 'center' });

  // Metadata
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  
  let yPos = 35;
  doc.text(`Erstellt am: ${format(new Date(), "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}`, 15, yPos);
  yPos += 5;
  
  // Filter info
  const filterParts: string[] = [];
  if (filters.status && filters.status !== 'all') {
    filterParts.push(`Status: ${statusLabels[filters.status]}`);
  }
  if (filters.priority && filters.priority !== 'all') {
    filterParts.push(`Priorität: ${priorityLabels[filters.priority]}`);
  }
  if (filters.dueDateFrom || filters.dueDateTo) {
    filterParts.push(`Zeitraum: ${filters.dueDateFrom || '...'} - ${filters.dueDateTo || '...'}`);
  }
  
  if (filterParts.length > 0) {
    doc.text(`Filter: ${filterParts.join(' | ')}`, 15, yPos);
    yPos += 5;
  }
  
  doc.text(`Anzahl Aufgaben: ${todos.length}`, 15, yPos);
  yPos += 10;

  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.line(15, yPos, pageWidth - 15, yPos);
  yPos += 8;

  // Tasks
  doc.setTextColor(0, 0, 0);
  
  for (let i = 0; i < todos.length; i++) {
    const todo = todos[i];
    const overdue = isOverdue(todo);
    
    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    // Task header with background
    const priorityColors: Record<string, [number, number, number]> = {
      low: [200, 200, 200],
      medium: [173, 216, 230],
      high: [255, 200, 100],
      urgent: [255, 150, 150],
    };
    
    const bgColor = priorityColors[todo.priority] || [240, 240, 240];
    doc.setFillColor(...bgColor);
    doc.rect(15, yPos - 4, pageWidth - 30, 8, 'F');
    
    // Task number and title
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`#${todo.task_number} - ${todo.title}`, 18, yPos);
    
    // Priority badge on the right
    doc.setFontSize(9);
    doc.text(`Priorität: ${priorityLabels[todo.priority].toUpperCase()}`, pageWidth - 18, yPos, { align: 'right' });
    
    yPos += 8;
    
    // Description
    if (todo.description) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      
      const descLines = doc.splitTextToSize(todo.description, pageWidth - 40);
      doc.text(descLines, 18, yPos);
      yPos += descLines.length * 4 + 2;
    }

    // Metadata row
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    
    const assignedName = todo.assigned_user 
      ? `${todo.assigned_user.first_name} ${todo.assigned_user.last_name}`.trim()
      : 'Nicht zugewiesen';
    
    const metaRow = [
      `Verantwortlich: ${assignedName}`,
      todo.category ? `Kategorie: ${todo.category.name}` : null,
      todo.building ? `Gebäude: ${todo.building.name}` : null,
      `Status: ${statusLabels[todo.status]}`,
    ].filter(Boolean).join('  |  ');
    
    doc.text(metaRow, 18, yPos);
    yPos += 4;

    // Due date
    if (todo.due_date) {
      const dueText = `Fällig: ${format(new Date(todo.due_date), "dd.MM.yyyy", { locale: de })}`;
      if (overdue) {
        doc.setTextColor(200, 0, 0);
        doc.text(`${dueText} (ÜBERFÄLLIG)`, 18, yPos);
      } else {
        doc.text(dueText, 18, yPos);
      }
      yPos += 4;
    }
    
    doc.setTextColor(0, 0, 0);

    // Subtasks
    if (options.includeSubtasks) {
      const { data: subtasks } = await supabase
        .from('todo_subtasks')
        .select('*')
        .eq('todo_id', todo.id)
        .order('sort_order');

      if (subtasks && subtasks.length > 0) {
        yPos += 2;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const completed = subtasks.filter(s => s.is_completed).length;
        doc.text(`Checkliste (${completed}/${subtasks.length}):`, 18, yPos);
        yPos += 4;
        
        doc.setFont('helvetica', 'normal');
        for (const subtask of subtasks) {
          const checkmark = subtask.is_completed ? '✓' : '○';
          doc.text(`  ${checkmark} ${subtask.title}`, 20, yPos);
          yPos += 3.5;
        }
      }
    }

    // Comments
    if (options.includeComments) {
      const { data: comments } = await supabase
        .from('todo_comments')
        .select('*, user:profiles!todo_comments_created_by_fkey(first_name, last_name)')
        .eq('todo_id', todo.id)
        .order('created_at');

      if (comments && comments.length > 0) {
        yPos += 2;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Kommentare (${comments.length}):`, 18, yPos);
        yPos += 4;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        for (const comment of comments) {
          const userName = comment.user 
            ? `${comment.user.first_name} ${comment.user.last_name}`.trim()
            : 'Unbekannt';
          const dateStr = format(new Date(comment.created_at), "dd.MM.yy", { locale: de });
          const commentText = doc.splitTextToSize(`${userName} (${dateStr}): ${comment.content}`, pageWidth - 45);
          doc.text(commentText, 20, yPos);
          yPos += commentText.length * 3.5;
        }
      }
    }

    // Separator
    yPos += 4;
    doc.setDrawColor(220, 220, 220);
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 6;
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Seite ${i} von ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
    doc.text(
      'RGI Immobilienverwaltung',
      pageWidth - 15,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'right' }
    );
  }

  // Save
  doc.save(`Aufgaben_${format(new Date(), "yyyy-MM-dd")}.pdf`);
}

// Helper to load image as base64
function loadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}
