
import { useState } from "react";
import { ChevronDown, ChevronRight, Users, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  created_at: string;
}

interface UsersListProps {
  buildingId: string;
  userType: 'tenants' | 'weg_owners';
  count: number;
}

export const UsersList = ({ buildingId, userType, count }: UsersListProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['building-users', buildingId, userType, page],
    queryFn: async () => {
      if (userType === 'tenants') {
        const { data, error } = await supabase
          .from('tenants')
          .select('user_id, email, first_name, last_name, phone, created_at')
          .eq('building_id', buildingId)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        return (data || []).map(user => ({ ...user, id: user.user_id }));
      } else {
        // For WEG owners, we need to join through the junction table differently
        const { data, error } = await supabase
          .from('weg_owner_buildings')
          .select(`
            user_id,
            created_at,
            weg_owners!inner (
              email,
              first_name,
              last_name,
              phone,
              created_at
            )
          `)
          .eq('building_id', buildingId)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        return (data || []).map(item => ({ 
          id: item.user_id,
          email: item.weg_owners.email,
          first_name: item.weg_owners.first_name,
          last_name: item.weg_owners.last_name,
          phone: item.weg_owners.phone,
          created_at: item.weg_owners.created_at
        }));
      }
    },
    enabled: isExpanded,
  });

  const title = userType === 'tenants' ? 'Mieter' : 'WEG-Eigentümer';
  const Icon = Users;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      setPage(0); // Reset to first page when expanding
    }
  };

  const hasMore = users.length === pageSize;
  const canLoadPrevious = page > 0;

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        className="w-full justify-start p-2 h-auto"
        onClick={handleToggle}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 mr-2" />
        ) : (
          <ChevronRight className="h-4 w-4 mr-2" />
        )}
        <Icon className="h-4 w-4 mr-2" />
        <span className="font-medium">{title}</span>
        <Badge variant="secondary" className="ml-2">
          {count}
        </Badge>
      </Button>

      {isExpanded && (
        <Card className="p-4 ml-6">
          {isLoading ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Lädt...
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Keine {title.toLowerCase()} gefunden
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-2 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">
                      {user.first_name && user.last_name 
                        ? `${user.first_name} ${user.last_name}`
                        : 'Name nicht angegeben'
                      }
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground mt-1">
                      <Mail className="h-3 w-3 mr-1" />
                      {user.email}
                      {user.phone && (
                        <>
                          <Phone className="h-3 w-3 ml-3 mr-1" />
                          {user.phone}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString('de-DE')}
                  </div>
                </div>
              ))}

              {/* Pagination Controls */}
              {(hasMore || canLoadPrevious) && (
                <div className="flex justify-between items-center pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={!canLoadPrevious}
                  >
                    Vorherige
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Seite {page + 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={!hasMore}
                  >
                    Nächste
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
