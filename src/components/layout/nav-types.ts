import type { LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  disabled?: boolean;
  badge?: string;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};
