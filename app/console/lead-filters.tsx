"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { CATEGORIES } from "@/lib/discovery/schema";
import {
  isFiltered,
  leadFiltersToQuery,
  type LeadFilters,
} from "@/lib/console/query";
import type { Stage } from "@/lib/console/stages";

const RANGES = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["all", "All time"],
] as const;

/*
  Radix Select and Tabs both report the chosen value as a plain string. These
  narrow it back to the filter union at the one boundary where it enters, so
  LeadFilters stays a closed set of values and parseLeadFilters remains the
  only other place that has to validate anything.
*/
function asComplete(v: string): LeadFilters["complete"] {
  return v === "complete" || v === "partial" ? v : "all";
}

function asRange(v: string): LeadFilters["range"] {
  return v === "7d" || v === "all" ? v : "30d";
}

/**
 * The console toolbar. Status is the primary split so it stays a visible Tabs
 * control; range and category are Selects, which keeps the row to one line and
 * survives the category list growing past what chips can hold.
 *
 * Search is debounced rather than submit-on-enter: filtering a short list
 * should feel immediate, and every change is a normal navigation so the URL
 * stays shareable and the back button works.
 */
export function LeadFilters({
  initial,
  stages,
}: {
  initial: LeadFilters;
  stages: Stage[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const typed = useRef(false);

  // Keep the field in step when navigation changes the query from elsewhere.
  useEffect(() => {
    if (!typed.current) setQ(initial.q);
  }, [initial.q]);

  useEffect(() => {
    if (!typed.current || q === initial.q) return;
    const t = setTimeout(() => {
      router.push(`/console${leadFiltersToQuery({ ...initial, q, page: 1 })}`);
    }, 300);
    return () => clearTimeout(t);
  }, [q, initial, router]);

  const go = (over: Partial<LeadFilters>) => {
    typed.current = false;
    // Reset to page 1: narrowing the set while on page 4 lands on nothing.
    router.push(
      `/console${leadFiltersToQuery({ ...initial, q, page: 1, ...over })}`,
    );
  };

  const filtered = isFiltered({ ...initial, q });

  return (
    <div className="flex flex-wrap items-center gap-2.5 max-sm:gap-2">
      <Tabs value={initial.complete} onValueChange={(v) => go({ complete: asComplete(v) })} className="max-sm:w-full">
        <TabsList className="max-sm:grid max-sm:w-full max-sm:grid-cols-3">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="complete">Complete</TabsTrigger>
          <TabsTrigger value="partial">Partial</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative min-w-[220px] max-w-[340px] flex-1 max-sm:min-w-0 max-sm:max-w-none max-sm:basis-full">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
        <Input
          type="search"
          value={q}
          onChange={(e) => {
            typed.current = true;
            setQ(e.target.value);
          }}
          placeholder="Search company, contact, or ref"
          aria-label="Search leads"
          className="h-9 pl-9"
        />
      </div>

      <Select value={initial.range} onValueChange={(v) => go({ range: asRange(v) })}>
        <SelectTrigger className="w-[150px] max-sm:w-auto max-sm:min-w-0 max-sm:flex-1" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGES.map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={initial.category} onValueChange={(v) => go({ category: v })}>
        <SelectTrigger className="w-[160px] max-sm:w-auto max-sm:min-w-0 max-sm:flex-1" aria-label="Category">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {CATEGORIES.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/*
         Stages are runtime data, so this list is whatever the admin has
         configured. Retired stages are offered only while one is the active
         filter, so an existing link keeps working without inviting new use.
      */}
      <Select value={initial.stage} onValueChange={(v) => go({ stage: v })}>
        <SelectTrigger
          className="w-[150px] max-sm:w-auto max-sm:min-w-0 max-sm:flex-1"
          aria-label="Stage"
        >
          <SelectValue placeholder="All stages" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All stages</SelectItem>
          {stages
            .filter((st) => !st.retired || st.slug === initial.stage)
            .map((st) => (
              <SelectItem key={st.slug} value={st.slug}>
                {st.label}
                {st.retired ? " (retired)" : ""}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>

      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            typed.current = false;
            setQ("");
            router.push("/console");
          }}
        >
          Reset
          <XIcon />
        </Button>
      )}
    </div>
  );
}
