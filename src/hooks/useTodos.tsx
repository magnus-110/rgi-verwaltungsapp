import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export interface Todo {
  id: string;
  task_number: number;
  title: string;
  description: string | null;
  category_id: string | null;
  assigned_to: string | null;
  created_by: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'done';
  building_id: string | null;
  attachments: any[];
  is_recurring: boolean;
  recurrence_pattern: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  recurrence_interval: number | null;
  recurrence_end_date: string | null;
  parent_todo_id: string | null;
  // Joined fields
  category?: TodoCategory;
  assigned_user?: { first_name: string; last_name: string; email: string };
  created_user?: { first_name: string; last_name: string; email: string };
  building?: { name: string; address: string };
  subtasks?: TodoSubtask[];
  comments?: TodoComment[];
}

export interface TodoCategory {
  id: string;
  name: string;
  color: string;
  created_at: string;
  created_by: string | null;
}

export interface TodoSubtask {
  id: string;
  todo_id: string;
  title: string;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  sort_order: number;
  completed_user?: { first_name: string; last_name: string };
}

export interface TodoComment {
  id: string;
  todo_id: string;
  content: string;
  created_by: string;
  created_at: string;
  user?: { first_name: string; last_name: string; email: string };
}

export interface TodoFilters {
  search: string;
  assignedTo: string;
  category: string;
  priority: string;
  status: string;
  dueDateFrom: string;
  dueDateTo: string;
  sortBy: 'due_date' | 'priority' | 'created_at' | 'task_number';
  sortOrder: 'asc' | 'desc';
}

export interface CreateTodoInput {
  title: string;
  description?: string;
  category_id?: string;
  assigned_to?: string;
  due_date?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  building_id?: string;
  is_recurring?: boolean;
  recurrence_pattern?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrence_interval?: number;
  recurrence_end_date?: string;
  subtasks?: string[];
  attachments?: any[];
}

// Fetch all todos with filters
export function useTodos(filters: TodoFilters) {
  return useQuery({
    queryKey: ['todos', filters],
    queryFn: async () => {
      let query = supabase
        .from('todos')
        .select(`
          *,
          category:todo_categories(*),
          assigned_user:profiles!todos_assigned_to_fkey(first_name, last_name, email),
          created_user:profiles!todos_created_by_fkey(first_name, last_name, email),
          building:buildings(name, address)
        `);

      // Apply filters
      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }
      if (filters.assignedTo && filters.assignedTo !== 'all') {
        if (filters.assignedTo === 'unassigned') {
          query = query.is('assigned_to', null);
        } else {
          query = query.eq('assigned_to', filters.assignedTo);
        }
      }
      if (filters.category && filters.category !== 'all') {
        query = query.eq('category_id', filters.category);
      }
      if (filters.priority && filters.priority !== 'all') {
        query = query.eq('priority', filters.priority);
      }
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.dueDateFrom) {
        query = query.gte('due_date', filters.dueDateFrom);
      }
      if (filters.dueDateTo) {
        query = query.lte('due_date', filters.dueDateTo);
      }

      // Apply sorting
      const sortOrder = filters.sortOrder === 'asc' ? true : false;
      if (filters.sortBy === 'priority') {
        // Custom priority order: urgent > high > medium > low
        query = query.order('priority', { ascending: sortOrder });
      } else {
        query = query.order(filters.sortBy, { ascending: sortOrder, nullsFirst: false });
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Todo[];
    },
  });
}

// Fetch single todo with all details
export function useTodo(todoId: string | null) {
  return useQuery({
    queryKey: ['todo', todoId],
    queryFn: async () => {
      if (!todoId) return null;
      
      const { data, error } = await supabase
        .from('todos')
        .select(`
          *,
          category:todo_categories(*),
          assigned_user:profiles!todos_assigned_to_fkey(first_name, last_name, email),
          created_user:profiles!todos_created_by_fkey(first_name, last_name, email),
          building:buildings(name, address)
        `)
        .eq('id', todoId)
        .single();

      if (error) throw error;
      return data as Todo;
    },
    enabled: !!todoId,
  });
}

// Fetch subtasks for a todo
export function useSubtasks(todoId: string | null) {
  return useQuery({
    queryKey: ['todo-subtasks', todoId],
    queryFn: async () => {
      if (!todoId) return [];
      
      const { data, error } = await supabase
        .from('todo_subtasks')
        .select(`
          *,
          completed_user:profiles!todo_subtasks_completed_by_fkey(first_name, last_name)
        `)
        .eq('todo_id', todoId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as TodoSubtask[];
    },
    enabled: !!todoId,
  });
}

// Fetch comments for a todo
export function useComments(todoId: string | null) {
  return useQuery({
    queryKey: ['todo-comments', todoId],
    queryFn: async () => {
      if (!todoId) return [];
      
      const { data, error } = await supabase
        .from('todo_comments')
        .select(`
          *,
          user:profiles!todo_comments_created_by_fkey(first_name, last_name, email)
        `)
        .eq('todo_id', todoId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as TodoComment[];
    },
    enabled: !!todoId,
  });
}

// Fetch categories
export function useCategories() {
  return useQuery({
    queryKey: ['todo-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('todo_categories')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data as TodoCategory[];
    },
  });
}

// Fetch assignable users (admins and employees)
export function useAssignableUsers() {
  return useQuery({
    queryKey: ['assignable-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email, role')
        .in('role', ['admin', 'employee'])
        .order('first_name', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

// Create todo mutation
export function useCreateTodo() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateTodoInput) => {
      const { subtasks, ...todoData } = input;
      
      const { data: todo, error } = await supabase
        .from('todos')
        .insert({
          ...todoData,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Create subtasks if provided
      if (subtasks && subtasks.length > 0 && todo) {
        const subtaskInserts = subtasks.map((title, index) => ({
          todo_id: todo.id,
          title,
          created_by: user?.id,
          sort_order: index,
        }));

        const { error: subtaskError } = await supabase
          .from('todo_subtasks')
          .insert(subtaskInserts);

        if (subtaskError) throw subtaskError;
      }

      return todo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast({ title: 'Aufgabe erstellt', description: 'Die Aufgabe wurde erfolgreich erstellt.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    },
  });
}

// Update todo mutation
export function useUpdateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Todo> & { id: string }) => {
      const { data, error } = await supabase
        .from('todos')
        .update({
          ...updates,
          completed_at: updates.status === 'done' ? new Date().toISOString() : null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      queryClient.invalidateQueries({ queryKey: ['todo'] });
      toast({ title: 'Aufgabe aktualisiert', description: 'Die Aufgabe wurde erfolgreich aktualisiert.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete todo mutation
export function useDeleteTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('todos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
      toast({ title: 'Aufgabe gelöscht', description: 'Die Aufgabe wurde erfolgreich gelöscht.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    },
  });
}

// Create category mutation
export function useCreateCategory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { data, error } = await supabase
        .from('todo_categories')
        .insert({ name, color, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todo-categories'] });
      toast({ title: 'Kategorie erstellt', description: 'Die Kategorie wurde erfolgreich erstellt.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    },
  });
}

// Create subtask mutation
export function useCreateSubtask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ todoId, title }: { todoId: string; title: string }) => {
      // Get max sort_order
      const { data: existingSubtasks } = await supabase
        .from('todo_subtasks')
        .select('sort_order')
        .eq('todo_id', todoId)
        .order('sort_order', { ascending: false })
        .limit(1);

      const nextSortOrder = existingSubtasks && existingSubtasks.length > 0 
        ? existingSubtasks[0].sort_order + 1 
        : 0;

      const { data, error } = await supabase
        .from('todo_subtasks')
        .insert({
          todo_id: todoId,
          title,
          created_by: user?.id,
          sort_order: nextSortOrder,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['todo-subtasks', variables.todoId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    },
  });
}

// Toggle subtask mutation
export function useToggleSubtask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, todoId, isCompleted }: { id: string; todoId: string; isCompleted: boolean }) => {
      const { data, error } = await supabase
        .from('todo_subtasks')
        .update({
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
          completed_by: isCompleted ? user?.id : null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { data, todoId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['todo-subtasks', result.todoId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete subtask mutation
export function useDeleteSubtask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, todoId }: { id: string; todoId: string }) => {
      const { error } = await supabase.from('todo_subtasks').delete().eq('id', id);
      if (error) throw error;
      return todoId;
    },
    onSuccess: (todoId) => {
      queryClient.invalidateQueries({ queryKey: ['todo-subtasks', todoId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    },
  });
}

// Create comment mutation
export function useCreateComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ todoId, content }: { todoId: string; content: string }) => {
      const { data, error } = await supabase
        .from('todo_comments')
        .insert({
          todo_id: todoId,
          content,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return { data, todoId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['todo-comments', result.todoId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Fehler', description: error.message, variant: 'destructive' });
    },
  });
}

// Helper function to check if task is overdue
export function isOverdue(todo: Todo): boolean {
  if (!todo.due_date || todo.status === 'done') return false;
  return new Date(todo.due_date) < new Date(new Date().toDateString());
}

// Priority labels
export const priorityLabels: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  urgent: 'Dringend',
};

// Status labels
export const statusLabels: Record<string, string> = {
  open: 'Offen',
  in_progress: 'In Bearbeitung',
  done: 'Erledigt',
};
