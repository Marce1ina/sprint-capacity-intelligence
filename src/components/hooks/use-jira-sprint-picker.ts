import { useCallback, useEffect, useRef, useState } from "react";
import type { JiraBoard, JiraSprint, SprintAssignee } from "@/types";

interface BoardsResponse {
  boards: JiraBoard[];
}

interface SprintsResponse {
  sprints: JiraSprint[];
}

interface AssigneesResponse {
  assignees: SprintAssignee[];
  sprintId: number;
}

interface ApiErrorBody {
  error?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = (await response.json()) as T & ApiErrorBody;

  if (!response.ok) {
    throw new Error(body.error ?? "Something went wrong. Please try again.");
  }

  return body;
}

export function useJiraSprintPicker() {
  const [boards, setBoards] = useState<JiraBoard[]>([]);
  const [sprints, setSprints] = useState<JiraSprint[]>([]);
  const [assignees, setAssignees] = useState<SprintAssignee[]>([]);
  const [selectedBoardId, setSelectedBoardIdState] = useState<number | null>(null);
  const [selectedSprintId, setSelectedSprintIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadingCountRef = useRef(0);

  const beginLoading = useCallback(() => {
    loadingCountRef.current += 1;
    setLoading(true);
  }, []);

  const endLoading = useCallback(() => {
    loadingCountRef.current -= 1;
    if (loadingCountRef.current <= 0) {
      loadingCountRef.current = 0;
      setLoading(false);
    }
  }, []);

  const loadBoards = useCallback(async () => {
    beginLoading();
    setError(null);

    try {
      const data = await fetchJson<BoardsResponse>("/api/jira/boards");
      setBoards(data.boards);
    } catch (err) {
      setBoards([]);
      setError(err instanceof Error ? err.message : "Could not load boards from Jira.");
    } finally {
      endLoading();
    }
  }, [beginLoading, endLoading]);

  const loadSprints = useCallback(
    async (boardId: number) => {
      beginLoading();
      setError(null);

      try {
        const data = await fetchJson<SprintsResponse>(`/api/jira/boards/${boardId}/sprints`);
        setSprints(data.sprints);
      } catch (err) {
        setSprints([]);
        setError(err instanceof Error ? err.message : "Could not load sprints from Jira.");
      } finally {
        endLoading();
      }
    },
    [beginLoading, endLoading],
  );

  const loadAssignees = useCallback(
    async (sprintId: number) => {
      beginLoading();
      setError(null);

      try {
        const data = await fetchJson<AssigneesResponse>(`/api/jira/sprints/${sprintId}/assignees`);
        setAssignees(data.assignees);
      } catch (err) {
        setAssignees([]);
        setError(err instanceof Error ? err.message : "Could not load sprint assignees from Jira.");
      } finally {
        endLoading();
      }
    },
    [beginLoading, endLoading],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBoards();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadBoards]);

  const setSelectedBoardId = useCallback(
    (boardId: number | null) => {
      setSelectedBoardIdState(boardId);
      setSelectedSprintIdState(null);
      setSprints([]);
      setAssignees([]);
      setError(null);

      if (boardId !== null) {
        void loadSprints(boardId);
      }
    },
    [loadSprints],
  );

  const setSelectedSprintId = useCallback(
    (sprintId: number | null) => {
      setSelectedSprintIdState(sprintId);
      setAssignees([]);
      setError(null);

      if (sprintId !== null) {
        void loadAssignees(sprintId);
      }
    },
    [loadAssignees],
  );

  const retry = useCallback(() => {
    if (selectedSprintId !== null) {
      void loadAssignees(selectedSprintId);
      return;
    }

    if (selectedBoardId !== null) {
      void loadSprints(selectedBoardId);
      return;
    }

    void loadBoards();
  }, [selectedBoardId, selectedSprintId, loadAssignees, loadSprints, loadBoards]);

  return {
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
  };
}
