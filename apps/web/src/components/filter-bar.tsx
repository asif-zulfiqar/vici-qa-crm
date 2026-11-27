// The global filter bar. Each page passes the fields it uses; values live in the URL
// (see src/lib/filters.ts). Page-specific filters (status, min length, ...) go in `children`.
import type { ReactNode } from "react";
import { CalendarRange, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { agentLabel, useAgents } from "@/hooks/use-agents";
import { useFilters } from "@/hooks/use-filters";
import {
  isFiltered,
  PERIODS,
  RANGE_PRESETS,
  rangeError,
  resetPatch,
  type FilterField,
} from "@/lib/filters";
import { cn } from "@/lib/utils";
import { OptionSelect } from "./option-select";

export function FilterItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** A text filter that applies on Enter or when the field loses focus, not on every key. */
export function CommitInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  className,
  type = "text",
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  type?: "text" | "number";
}) {
  return (
    <Input
      // A new `key` resets the field when the URL value changes from outside (e.g. Reset).
      key={value}
      type={type}
      defaultValue={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn("w-32", className)}
      min={type === "number" ? 0 : undefined}
      onBlur={(e) => {
        if (e.currentTarget.value.trim() !== value) onCommit(e.currentTarget.value.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(e.currentTarget.value.trim());
      }}
    />
  );
}

export function FilterBar({ fields, children }: { fields: readonly FilterField[]; children?: ReactNode }) {
  const { filters, setFilters, today } = useFilters();
  const { allowed: agentListAllowed, agents, teams } = useAgents();
  const has = (field: FilterField) => fields.includes(field);
  const error = has("dates") ? rangeError(filters) : null;

  return (
    <div className="mb-4 grid gap-2">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        {has("dates") && (
          <>
            <FilterItem label="From (ET)">
              <Input
                type="date"
                aria-label="From day"
                className="w-38"
                value={filters.from}
                max={today}
                onChange={(e) => {
                  const from = e.target.value;
                  if (!from) return;
                  setFilters(from > filters.to ? { from, to: from } : { from });
                }}
              />
            </FilterItem>
            <FilterItem label="To (ET)">
              <Input
                type="date"
                aria-label="To day"
                className="w-38"
                value={filters.to}
                min={filters.from}
                max={today}
                onChange={(e) => {
                  if (e.target.value) setFilters({ to: e.target.value });
                }}
              />
            </FilterItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" aria-label="Quick date ranges" />}>
                <CalendarRange aria-hidden />
                Range
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {RANGE_PRESETS.map((preset) => (
                  <DropdownMenuItem key={preset.id} onClick={() => setFilters(preset.range(today))}>
                    {preset.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        {has("period") && (
          <FilterItem label="Period">
            <div role="radiogroup" aria-label="Period" className="flex h-8 rounded-lg border p-0.5">
              {PERIODS.map((period) => (
                <button
                  key={period}
                  type="button"
                  role="radio"
                  aria-checked={filters.period === period}
                  onClick={() => setFilters({ period })}
                  className={cn(
                    "rounded-md px-2.5 text-sm capitalize transition-colors",
                    filters.period === period
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {period}
                </button>
              ))}
            </div>
          </FilterItem>
        )}

        {has("agent") && (
          <FilterItem label="Agent">
            {agentListAllowed ? (
              <OptionSelect
                ariaLabel="Agent"
                allLabel="All agents"
                value={filters.agent}
                onChange={(agent) => setFilters({ agent })}
                options={agents.map((a) => ({ value: a.vicidialUser, label: agentLabel(a) }))}
              />
            ) : (
              <CommitInput
                ariaLabel="Agent"
                placeholder="Agent id"
                value={filters.agent}
                onCommit={(agent) => setFilters({ agent })}
              />
            )}
          </FilterItem>
        )}

        {has("team") && (
          <FilterItem label="Team">
            {agentListAllowed ? (
              <OptionSelect
                ariaLabel="Team"
                allLabel="All teams"
                value={filters.team}
                onChange={(team) => setFilters({ team })}
                options={teams.map((t) => ({ value: t, label: t }))}
              />
            ) : (
              <CommitInput
                ariaLabel="Team"
                placeholder="User group"
                value={filters.team}
                onCommit={(team) => setFilters({ team })}
              />
            )}
          </FilterItem>
        )}

        {has("campaign") && (
          <FilterItem label="Campaign">
            <CommitInput
              ariaLabel="Campaign"
              placeholder="e.g. MAIN"
              value={filters.campaign}
              onCommit={(campaign) => setFilters({ campaign })}
            />
          </FilterItem>
        )}

        {children}

        {isFiltered(filters, today) && (
          <Button variant="ghost" onClick={() => setFilters(resetPatch())}>
            <RotateCcw aria-hidden />
            Reset
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
