import { type ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  color?: string;
  className?: string;
}

export function Badge({ children, color = "stone", className = "" }: BadgeProps) {
  const colorMap: Record<string, string> = {
    stone: "bg-stone-100 text-stone-700",
    blue: "bg-sky-100 text-sky-800",
    amber: "bg-amber-100 text-amber-800",
    violet: "bg-violet-100 text-violet-800",
    emerald: "bg-emerald-100 text-emerald-800",
    rose: "bg-rose-100 text-rose-800",
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-100 text-green-800",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[color] ?? colorMap.stone} ${className}`}
    >
      {children}
    </span>
  );
}
