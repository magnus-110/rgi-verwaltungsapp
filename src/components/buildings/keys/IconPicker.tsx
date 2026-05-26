import { useState } from "react";
import {
  Home, Users, User, Flame, Mail, KeyRound, Car, DoorOpen, DoorClosed, Lightbulb,
  Wrench, Settings, Lock, Unlock, Briefcase, FileText, Building2, Warehouse, ParkingCircle,
  Mailbox, Trees, Sofa, Bath, BedDouble, Utensils, Tv, Wifi, Package, Archive, Shield,
  Bike, Trash2, Droplets, Zap, Snowflake, Sun, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const HOUSE_ICONS: Record<string, LucideIcon> = {
  "home": Home, "building": Building2, "warehouse": Warehouse, "door-open": DoorOpen,
  "door-closed": DoorClosed, "lock": Lock, "unlock": Unlock, "key-round": KeyRound,
  "user": User, "users": Users, "mail": Mail, "mailbox": Mailbox,
  "flame": Flame, "lightbulb": Lightbulb, "zap": Zap, "droplets": Droplets,
  "snowflake": Snowflake, "sun": Sun, "wrench": Wrench, "settings": Settings,
  "briefcase": Briefcase, "file-text": FileText, "shield": Shield, "package": Package,
  "archive": Archive, "trash-2": Trash2, "car": Car, "bike": Bike,
  "parking-circle": ParkingCircle, "trees": Trees, "sofa": Sofa, "bath": Bath,
  "bed-double": BedDouble, "utensils": Utensils, "tv": Tv, "wifi": Wifi,
};

export const HouseIcon = ({ name, className }: { name?: string | null; className?: string }) => {
  if (!name) return null;
  const Ico = HOUSE_ICONS[name];
  if (!Ico) return null;
  return <Ico className={className ?? "h-4 w-4"} />;
};

interface Props {
  value?: string | null;
  onChange: (name: string) => void;
}

export const IconPicker = ({ value, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const Current = value ? HOUSE_ICONS[value] : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" type="button" className="w-full justify-start gap-2 h-9">
          {Current ? <Current className="h-4 w-4" /> : <KeyRound className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm">{value ?? "Icon wählen"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <div className="grid grid-cols-7 gap-1 max-h-60 overflow-y-auto">
          {Object.entries(HOUSE_ICONS).map(([name, Ico]) => (
            <button
              key={name}
              type="button"
              onClick={() => { onChange(name); setOpen(false); }}
              title={name}
              className={cn(
                "h-9 w-9 flex items-center justify-center rounded hover:bg-accent",
                value === name && "bg-primary text-primary-foreground hover:bg-primary"
              )}
            >
              <Ico className="h-4 w-4" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
