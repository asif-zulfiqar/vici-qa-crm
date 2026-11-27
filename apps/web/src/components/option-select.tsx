// A dropdown with an "All ..." choice on top, e.g. "All agents", 1001, 1003, ...
// "" means "All" for the caller; inside, Base UI gets a fixed marker value for it.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "__all__";

export type Option = { value: string; label: string };

export function OptionSelect({
  value,
  onChange,
  options,
  allLabel,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  allLabel: string;
  ariaLabel: string;
  className?: string;
}) {
  // A value from the URL that is not in the list (e.g. an old agent) still shows.
  const known = value === "" || options.some((o) => o.value === value);
  const items: Option[] = [{ value: ALL, label: allLabel }, ...options, ...(known ? [] : [{ value, label: value }])];

  return (
    <Select
      items={items}
      value={value === "" ? ALL : value}
      onValueChange={(next) => onChange(next === null || next === ALL ? "" : String(next))}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn("min-w-36", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
