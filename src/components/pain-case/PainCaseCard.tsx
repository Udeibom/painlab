import Link from "next/link";
import type { PainCase } from "@prisma/client";
import { Badge } from "../ui/Badge";

interface PainCaseCardProps {
  painCase: PainCase & {
    _count: {
      observations: number;
      hypotheses: number;
      experiments: number;
      learnings: number;
    };
  };
}

const statusLabels: Record<string, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  RESOLVED: "Resolved",
  ABANDONED: "Abandoned",
};

const importanceLabels: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const statusColors: Record<string, string> = {
  ACTIVE: "green",
  PAUSED: "yellow",
  RESOLVED: "blue",
  ABANDONED: "gray",
};

const importanceColors: Record<string, string> = {
  LOW: "gray",
  MEDIUM: "amber",
  HIGH: "red",
};

export function PainCaseCard({ painCase }: PainCaseCardProps) {
  const totalEntries =
    painCase._count.observations +
    painCase._count.hypotheses +
    painCase._count.experiments +
    painCase._count.learnings;

  return (
    <Link href={`/cases/${painCase.id}`}>
      <div className="group rounded-lg border border-stone-200 bg-white p-4 transition-colors hover:border-stone-400 hover:bg-stone-50">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-stone-900 group-hover:text-stone-700">
            {painCase.title}
          </h3>
          <div className="flex flex-shrink-0 gap-1.5">
            <Badge color={statusColors[painCase.status] ?? "gray"}>
              {statusLabels[painCase.status] ?? painCase.status}
            </Badge>
            <Badge color={importanceColors[painCase.importance] ?? "gray"}>
              {importanceLabels[painCase.importance] ?? painCase.importance}
            </Badge>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-stone-500">
          {painCase.description}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-stone-400">
          <span>{totalEntries} entries</span>
          {painCase.tags.length > 0 && (
            <span>· {painCase.tags.join(", ")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
