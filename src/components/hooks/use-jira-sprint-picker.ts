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
  const sprintsRequestRef = useRef(0);
  const assigneesRequestRef = useRef(0);

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
      const requestId = ++sprintsRequestRef.current;
      beginLoading();
      setError(null);

      try {
        const data = await fetchJson<SprintsResponse>(`/api/jira/boards/${boardId}/sprints`);
        if (requestId !== sprintsRequestRef.current) {
          return;
        }
        setSprints(data.sprints);
      } catch (err) {
        if (requestId !== sprintsRequestRef.current) {
          return;
        }
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
      const requestId = ++assigneesRequestRef.current;
      beginLoading();
      setError(null);

      try {
        const data = await fetchJson<AssigneesResponse>(`/api/jira/sprints/${sprintId}/assignees`);
        if (requestId !== assigneesRequestRef.current) {
          return;
        }
        setAssignees(data.assignees);
      } catch (err) {
        if (requestId !== assigneesRequestRef.current) {
          return;
        }
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
      sprintsRequestRef.current += 1;
      assigneesRequestRef.current += 1;
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
      assigneesRequestRef.current += 1;
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
