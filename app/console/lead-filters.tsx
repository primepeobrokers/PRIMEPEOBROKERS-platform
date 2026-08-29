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

export interface FilterState {
  q: string;
  complete: string;
  range: string;
  category: string;
}

const RANGES = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["all", "All time"],
] as const;

function toQuery({ q, complete, range, category }: FilterState): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (complete !== "all") sp.set("complete", complete);
  if (range !== "30d") sp.set("range", range);
  if (category !== "all") sp.set("category", category);
  const s = sp.toString();
  return s ? `?${s}` : "";
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
export function LeadFilters({ initial }: { initial: FilterState }) {
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
      router.push(`/console${toQuery({ ...initial, q })}`);
    }, 300);
    return () => clearTimeout(t);
  }, [q, initial, router]);

  const go = (over: Partial<FilterState>) => {
    typed.current = false;
    router.push(`/console${toQuery({ ...initial, q, ...over })}`);
  };

  const isFiltered =
    !!q ||
    initial.complete !== "all" ||
    initial.range !== "30d" ||
    initial.category !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2.5 max-sm:gap-2">
      <Tabs value={initial.complete} onValueChange={(v) => go({ complete: v })} className="max-sm:w-full">
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

      <Select value={initial.range} onValueChange={(v) => go({ range: v })}>
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

      {isFiltered && (
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
