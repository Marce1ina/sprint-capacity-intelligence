import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ServerError } from "@/components/auth/ServerError";
import { useSprintRiskTable } from "@/components/hooks/use-sprint-risk-table";
import { cn } from "@/lib/utils";
import type { RiskBand } from "@/types";

const RISK_BAND_LABEL: Record<RiskBand, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const RISK_BAND_CLASSNAME: Record<RiskBand, string> = {
  low: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  medium: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  high: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  critical: "border-red-400/30 bg-red-400/10 text-red-300",
};

function RiskBadge({ band }: { band: RiskBand }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        RISK_BAND_CLASSNAME[band],
      )}
    >
      {RISK_BAND_LABEL[band]}
    </span>
  );
}

export default function SprintRiskTable({ sprintId }: { sprintId: number }) {
  const { rows, loading, error, retry } = useSprintRiskTable(sprintId);

  return (
    <div className="relative min-h-[160px] space-y-3">
      <h2 className="text-sm font-medium text-blue-100/80">Sprint risk</h2>

      {loading && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        </div>
      )}

      {error && (
        <div className="space-y-3">
          <ServerError message={error} />
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-blue-100/60">
          No connected assignees for this sprint yet.
        </p>
      )}

      {!error && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-blue-100/80">Name</TableHead>
              <TableHead className="text-right text-blue-100/80">Story Points</TableHead>
              <TableHead className="text-right text-blue-100/80">Meeting Hours</TableHead>
              <TableHead className="text-right text-blue-100/80">Context Switches</TableHead>
              <TableHead className="text-right text-blue-100/80">Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.accountId} className="border-white/10 text-white hover:bg-white/5">
                <TableCell>{row.displayName}</TableCell>
                {row.status === "ok" ? (
                  <>
                    <TableCell className="text-right font-medium tabular-nums">{row.totalStoryPoints}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{row.meetingHours.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{row.contextSwitches}</TableCell>
                    <TableCell className="text-right">
                      <RiskBadge band={row.riskBand} />
                    </TableCell>
                  </>
                ) : (
                  <TableCell colSpan={4} className="text-right text-sm text-blue-100/50">
                    {row.status === "reconnect_required" ? "Reconnect required" : "Could not load calendar data"}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
