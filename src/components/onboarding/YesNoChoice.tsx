import { Check, X } from "lucide-react";
import { BigChoiceCard } from "./BigChoiceCard";

interface YesNoChoiceProps {
  value: boolean | null;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
  yesDescription?: string;
  noDescription?: string;
}

export const YesNoChoice = ({
  value,
  onChange,
  yesLabel = "Ja",
  noLabel = "Nein",
  yesDescription,
  noDescription,
}: YesNoChoiceProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <BigChoiceCard
        icon={Check}
        title={yesLabel}
        description={yesDescription}
        selected={value === true}
        onClick={() => onChange(true)}
      />
      <BigChoiceCard
        icon={X}
        title={noLabel}
        description={noDescription}
        selected={value === false}
        onClick={() => onChange(false)}
      />
    </div>
  );
};
