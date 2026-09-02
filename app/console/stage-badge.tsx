import { Badge } from "@/app/components/ui/badge";
import { stageLabel, stageTone, type Stage } from "@/lib/console/stages";

/**
 * A lead's pipeline stage.
 *
 * The single render site for a stage, so the colourway lookup and the retired
 * slug fallback live in one place rather than in the list, the mobile card and
 * the detail page separately. Matches the State badge in lead-row.tsx: mono
 * voice, a bg-current dot, so colour is never the only signal (four
 * colourways serve any number of stages, and two may share one).
 */
export function StageBadge({
  slug,
  stages,
  className,
}: {
  slug: string;
  stages: Stage[];
  className?: string;
}) {
  return (
    <Badge
      variant={stageTone(slug, stages)}
      tone="mono"
      className={className ? `gap-1.5 ${className}` : "gap-1.5"}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {stageLabel(slug, stages)}
    </Badge>
  );
}
