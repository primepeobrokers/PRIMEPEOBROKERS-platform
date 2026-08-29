import {
  BuildingIcon,
  BanknoteIcon,
  UsersIcon,
  UserSearchIcon,
  TargetIcon,
  GraduationCapIcon,
  CircleDashedIcon,
  type LucideProps,
} from "lucide-react";

/**
 * Drawn icons for the discovery categories. These replace the emoji the
 * schema used to carry: emoji render differently on every platform, and the
 * green check and multicolour chart pulled two colours the brand does not
 * have into the first thing a visitor sees. One library, one stroke weight,
 * and the colour is set by the caller so selection state can drive it.
 */
const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  peo: BuildingIcon,
  payroll: BanknoteIcon,
  hris: UsersIcon,
  recruiting: UserSearchIcon,
  performance: TargetIcon,
  learning: GraduationCapIcon,
};

export function CategoryIcon({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const Icon = ICONS[id] ?? CircleDashedIcon;
  return <Icon aria-hidden className={className} strokeWidth={1.75} />;
}
