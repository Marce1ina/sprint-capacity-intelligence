import { useCallback, useEffect, useRef, useState } from "react";
import type { AssigneeRiskRow } from "@/types";

interface RiskResponse {
  sprintId: number;
  rows: AssigneeRiskRow[];
}

interface ApiErrorBody {
  error?: string;
}

export function useSprintRiskTable(sprintId: number | null) {
  const [rows, setRows] = useState<AssigneeRiskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const reset = useCallback(() => {
    requestRef.current += 1;
    setRows([]);
    setError(null);
    setLoading(false);
  }, []);

  const load = useCallback(async (targetSprintId: number) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jira/sprints/${targetSprintId}/risk`);
      const body = (await response.json()) as RiskResponse & ApiErrorBody;

      if (requestId !== requestRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(body.error ?? "Could not load the sprint risk table.");
      }

      setRows(body.rows);
    } catch (err) {
      if (requestId !== requestRef.current) {
        return;
      }
      setRows([]);
      setError(err instanceof Error ? err.message : "Could not load the sprint risk table.");
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (sprintId === null) {
        reset();
        return;
      }
      void load(sprintId);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sprintId, load, reset]);

  const retry = useCallback(() => {
    if (sprintId !== null) {
      void load(sprintId);
    }
  }, [sprintId, load]);

  return { rows, loading, error, retry };
}
