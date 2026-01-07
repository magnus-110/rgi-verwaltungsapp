import React from "react";
import { Button } from "@/components/ui/button";
import { Building2, FileText } from "lucide-react";

interface CategorySelectorProps {
  category: 'building' | 'general';
  onCategoryChange: (category: 'building' | 'general') => void;
}

export function CategorySelector({ category, onCategoryChange }: CategorySelectorProps) {
  return (
    <div className="flex bg-muted rounded-lg p-1 w-fit">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCategoryChange('building')}
        className={`flex items-center gap-2 rounded-md transition-colors ${
          category === 'building'
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-background text-muted-foreground'
        }`}
      >
        <Building2 className="h-4 w-4" />
        Gebäude-Dokumente
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCategoryChange('general')}
        className={`flex items-center gap-2 rounded-md transition-colors ${
          category === 'general'
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-background text-muted-foreground'
        }`}
      >
        <FileText className="h-4 w-4" />
        Allgemeine Dokumente
      </Button>
    </div>
  );
}
