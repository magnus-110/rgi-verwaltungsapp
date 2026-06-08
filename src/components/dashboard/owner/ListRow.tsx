import { ReactNode } from "react";
import { LucideIcon, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListRowProps {
  icon?: LucideIcon;
  iconNode?: ReactNode;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onClick?: () => void;
  href?: string;
  showChevron?: boolean;
  as?: "button" | "a" | "div";
  className?: string;
}

/**
 * Standard list row matching the onboarding wizard's BigChoiceCard pattern.
 * Icon-square (44px) on the left, title + subtitle, optional right content / chevron.
 * Large tap target (min 64px) for 40+ users.
 */
export const ListRow = ({
  icon: Icon,
  iconNode,
  iconBg = "bg-primary/10",
  iconColor = "text-primary",
  title,
  subtitle,
  right,
  onClick,
  href,
  showChevron,
  as,
  className,
}: ListRowProps) => {
  const Tag: any = as ?? (href ? "a" : onClick ? "button" : "div");
  const isInteractive = !!(onClick || href);
  return (
    <Tag
      {...(href ? { href } : {})}
      {...(onClick ? { onClick, type: "button" } : {})}
      className={cn(
        "w-full flex items-center gap-4 px-4 py-3.5 text-left min-h-[64px]",
        isInteractive && "transition-colors hover:bg-muted/40 active:bg-muted/60",
        className
      )}
    >
      {(Icon || iconNode) && (
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            iconBg
          )}
        >
          {iconNode ?? (Icon && <Icon className={cn("h-5 w-5", iconColor)} />)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-foreground leading-tight">
          {title}
        </div>
        {subtitle && (
          <div className="text-[13px] text-muted-foreground mt-0.5 leading-snug truncate">
            {subtitle}
          </div>
        )}
      </div>
      {right}
      {showChevron && (
        <ChevronRight className="h-5 w-5 text-muted-foreground/60 shrink-0" />
      )}
    </Tag>
  );
};
