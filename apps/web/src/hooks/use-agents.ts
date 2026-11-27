// Agents for the filter lists (GET /api/agents), and the teams (user groups) among them.
// Only for users who may see agents; others type an agent id instead.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AgentListItem, AgentsResponse } from "@vici/shared";
import { api } from "@/lib/api";
import { useCan } from "./use-can";

export function useAgents() {
  const allowed = useCan("agents.view", "agents.view_own");
  const query = useQuery({
    queryKey: ["agents"],
    queryFn: ({ signal }) => api.get<AgentsResponse>("/agents", { signal }),
    enabled: allowed,
    staleTime: 5 * 60_000,
  });
  const agents: AgentListItem[] = useMemo(() => query.data?.items ?? [], [query.data]);
  const teams = useMemo(
    () => [...new Set(agents.map((a) => a.userGroup).filter((g): g is string => Boolean(g)))].sort(),
    [agents],
  );
  return { allowed, agents, teams, isLoading: query.isLoading };
}

/** "1004" or "1004 · Jane" when VICIdial has a real name (often it is just the id again). */
export function agentLabel(agent: Pick<AgentListItem, "vicidialUser" | "fullName">): string {
  const name = agent.fullName?.trim();
  return name && name !== agent.vicidialUser ? `${agent.vicidialUser} · ${name}` : agent.vicidialUser;
}
