 import { useState } from 'react';
 import { Button } from '@/components/ui/button';
 import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
 import { Switch } from '@/components/ui/switch';
 import { Label } from '@/components/ui/label';
 import { Checkbox } from '@/components/ui/checkbox';
 import { Filter, CheckSquare, Calendar } from 'lucide-react';
 import { useCategories } from '@/hooks/useTodos';
 
 interface CalendarFiltersProps {
   filters: {
     showTodos: boolean;
     showEvents: boolean;
     categories: string[];
     assignees: string[];
     buildings: string[];
   };
   onFiltersChange: (filters: CalendarFiltersProps['filters']) => void;
 }
 
 export function CalendarFilters({ filters, onFiltersChange }: CalendarFiltersProps) {
   const { data: categories = [] } = useCategories();
   const [open, setOpen] = useState(false);
   
   const toggleCategory = (categoryName: string) => {
     const newCategories = filters.categories.includes(categoryName)
       ? filters.categories.filter(c => c !== categoryName)
       : [...filters.categories, categoryName];
     onFiltersChange({ ...filters, categories: newCategories });
   };
   
   const activeFilterCount = [
     !filters.showTodos,
     !filters.showEvents,
     filters.categories.length > 0,
   ].filter(Boolean).length;
 
   return (
     <Popover open={open} onOpenChange={setOpen}>
       <PopoverTrigger asChild>
         <Button variant="outline" size="sm" className="gap-2">
           <Filter className="h-4 w-4" />
           <span className="hidden sm:inline">Filter</span>
           {activeFilterCount > 0 && (
             <span className="bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[18px]">
               {activeFilterCount}
             </span>
           )}
         </Button>
       </PopoverTrigger>
       <PopoverContent className="w-[280px]" align="end">
         <div className="space-y-4">
           <h4 className="font-medium">Anzeigen</h4>
           
           {/* Toggle Todos/Events */}
           <div className="space-y-3">
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <CheckSquare className="h-4 w-4 text-green-600" />
                 <Label>Aufgaben</Label>
               </div>
               <Switch 
                 checked={filters.showTodos}
                 onCheckedChange={(checked) => onFiltersChange({ ...filters, showTodos: checked })}
               />
             </div>
             
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <Calendar className="h-4 w-4 text-blue-600" />
                 <Label>Termine</Label>
               </div>
               <Switch 
                 checked={filters.showEvents}
                 onCheckedChange={(checked) => onFiltersChange({ ...filters, showEvents: checked })}
               />
             </div>
           </div>
           
           {/* Category Filter */}
           {categories.length > 0 && (
             <div className="space-y-2 pt-2 border-t">
               <h4 className="font-medium text-sm">Kategorien</h4>
               <div className="space-y-1 max-h-[150px] overflow-y-auto">
                 {categories.map(cat => (
                   <div 
                     key={cat.id}
                     className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                     onClick={() => toggleCategory(cat.name)}
                   >
                     <Checkbox checked={filters.categories.includes(cat.name)} />
                     <div 
                       className="w-3 h-3 rounded-full shrink-0" 
                       style={{ backgroundColor: cat.color }}
                     />
                     <span className="text-sm">{cat.name}</span>
                   </div>
                 ))}
               </div>
               {filters.categories.length > 0 && (
                 <Button 
                   variant="ghost" 
                   size="sm" 
                   className="w-full text-xs"
                   onClick={() => onFiltersChange({ ...filters, categories: [] })}
                 >
                   Alle anzeigen
                 </Button>
               )}
             </div>
           )}
         </div>
       </PopoverContent>
     </Popover>
   );
 }