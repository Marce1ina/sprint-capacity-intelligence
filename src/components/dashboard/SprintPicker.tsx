import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ServerError } from "@/components/auth/ServerError";
import { useJiraSprintPicker } from "@/components/hooks/use-jira-sprint-picker";
import { cn } from "@/lib/utils";

const selectTriggerClassName =
  "w-full border-white/20 bg-white/5 text-white shadow-none focus-visible:border-purple-400/50 focus-visible:ring-purple-400/30 data-[placeholder]:text-blue-100/50";

const selectContentClassName =
  "border-white/20 bg-[#0f1529] text-white data-[side=bottom]:translate-y-0 data-[side=top]:translate-y-0";

export default function SprintPicker() {
  const {
    boards,
    sprints,
    assignees,
    selectedBoardId,
    selectedSprintId,
    setSelectedBoardId,
    setSelectedSprintId,
    loading,
    error,
    retry,
  } = useJiraSprintPicker();

  const showNoBoards = !loading && !error && boards.length === 0;
  const showNoSprints = selectedBoardId !== null && !loading && !error && sprints.length === 0;

  return (
    <div className="relative min-h-[280px]">
      {loading && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="size-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        </div>
      )}

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="board-select" className="text-sm font-medium text-blue-100/80">
              Board
            </label>
            <Select
              value={selectedBoardId !== null ? String(selectedBoardId) : undefined}
              onValueChange={(value) => {
                setSelectedBoardId(Number(value));
              }}
            >
              <SelectTrigger id="board-select" className={selectTriggerClassName}>
                <SelectValue placeholder="Select a board" />
              </SelectTrigger>
              <SelectContent className={selectContentClassName} position="popper">
                {boards.map((board) => (
                  <SelectItem key={board.id} value={String(board.id)}>
                    {board.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showNoBoards && <p className="text-sm text-blue-100/60">No Jira boards found for your account.</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="sprint-select" className="text-sm font-medium text-blue-100/80">
              Sprint
            </label>
            <Select
              value={selectedSprintId !== null ? String(selectedSprintId) : undefined}
              onValueChange={(value) => {
                setSelectedSprintId(Number(value));
              }}
              disabled={selectedBoardId === null || sprints.length === 0}
            >
              <SelectTrigger id="sprint-select" className={selectTriggerClassName}>
                <SelectValue
                  placeholder={
                    selectedBoardId === null
                      ? "Select a board first"
                      : showNoSprints
                        ? "No active or future sprints"
                        : "Select a sprint"
                  }
                />
              </SelectTrigger>
              <SelectContent className={selectContentClassName} position="popper">
                {sprints.map((sprint) => (
                  <SelectItem key={sprint.id} value={String(sprint.id)}>
                    {sprint.name}
                    {sprint.state ? ` (${sprint.state})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showNoSprints && <p className="text-sm text-blue-100/60">No active or future sprints on this board.</p>}
          </div>
        </div>

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

        {selectedSprintId === null ? (
          <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-blue-100/60">
            Select a board and sprint to view assignee workload.
          </p>
        ) : (
          <AssigneeTable assignees={assignees} sprintId={selectedSprintId} />
        )}
      </div>
    </div>
  );
}

type InviteState = "idle" | "loading" | "copied" | "error";

function AssigneeTable({
  assignees,
  sprintId,
}: {
  assignees: ReturnType<typeof useJiraSprintPicker>["assignees"];
  sprintId: number;
}) {
  const [inviteState, setInviteState] = useState<Record<string, InviteState>>({});

  if (assignees.length === 0) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-blue-100/60">
        No assignees found for this sprint.
      </p>
    );
  }

  async function handleInvite(accountId: string, displayName: string) {
    setInviteState((prev) => ({ ...prev, [accountId]: "loading" }));
    try {
      const response = await fetch(`/api/jira/sprints/${sprintId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jiraAccountId: accountId, jiraDisplayName: displayName }),
      });
      if (!response.ok) {
        throw new Error("Invite request failed");
      }
      const data = (await response.json()) as { url: string };
      await navigator.clipboard.writeText(data.url);
      setInviteState((prev) => ({ ...prev, [accountId]: "copied" }));
    } catch {
      setInviteState((prev) => ({ ...prev, [accountId]: "error" }));
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-white/10 hover:bg-transparent">
          <TableHead className="text-blue-100/80">Name</TableHead>
          <TableHead className="text-right text-blue-100/80">Story Points</TableHead>
          <TableHead className="text-right text-blue-100/80">Invite</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assignees.map((assignee) => {
          const accountId = assignee.accountId;
          const state = accountId ? (inviteState[accountId] ?? "idle") : "idle";

          return (
            <TableRow key={accountId ?? "unassigned"} className={cn("border-white/10 text-white hover:bg-white/5")}>
              <TableCell>{assignee.displayName}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{assignee.totalStoryPoints}</TableCell>
              <TableCell className="text-right">
                {accountId && (
                  <button
                    type="button"
                    disabled={state === "loading"}
                    onClick={() => handleInvite(accountId, assignee.displayName)}
                    className="rounded-lg border border-white/20 bg-white/10 px-3 py-1 text-xs text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                  >
                    {state === "copied"
                      ? "Copied"
                      : state === "loading"
                        ? "..."
                        : state === "error"
                          ? "Retry"
                          : "Invite"}
                  </button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
