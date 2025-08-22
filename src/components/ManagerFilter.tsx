
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ManagerFilterProps {
  value: string;
  onValueChange: (value: string) => void;
}

export const ManagerFilter = ({ value, onValueChange }: ManagerFilterProps) => {
  const { profile } = useAuth();

  // Lade alle Verwalter für Admin-Nutzer
  const { data: managers = [] } = useQuery({
    queryKey: ['managers-list'],
    queryFn: async () => {
      if (profile?.role !== 'admin') return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .eq('role', 'admin')
        .order('first_name');

      if (error) throw error;
      return data;
    },
    enabled: profile?.role === 'admin'
  });

  if (profile?.role !== 'admin' || managers.length === 0) {
    return null;
  }

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Nach Verwalter filtern" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Alle Verwalter</SelectItem>
        {managers.map((manager) => (
          <SelectItem key={manager.user_id} value={manager.user_id}>
            {manager.first_name} {manager.last_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
