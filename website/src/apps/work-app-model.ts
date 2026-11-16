export function createsWorkCycle(
  tasks: any[],
  taskId: string | undefined,
  parentId: string | null,
  dependencies: string[],
) {
  const id = taskId || 'new-task',
    graph = new Map<string, string[]>();
  for (const t of tasks)
    graph.set(t.id, [...(t.id === id ? dependencies : t.data.dependencies || [])]);
  graph.set(id, [...dependencies]);
  for (const t of tasks) {
    const parent = t.id === id ? parentId : t.parent_id || t.data.parent_id;
    if (parent) {
      const edges = graph.get(parent) || [];
      edges.push(t.id);
      graph.set(parent, edges);
    }
  }
  if (!tasks.some((t) => t.id === id) && parentId)
    graph.set(parentId, [...(graph.get(parentId) || []), id]);
  const visited = new Set<string>(),
    active = new Set<string>();
  function visit(node: string): boolean {
    if (active.has(node)) return true;
    if (visited.has(node)) return false;
    active.add(node);
    for (const next of graph.get(node) || []) if (visit(next)) return true;
    active.delete(node);
    visited.add(node);
    return false;
  }
  return [...graph.keys()].some(visit);
}
export function workBlocked(task: any, tasks: any[]) {
  return (
    task.data.dependencies.some(
      (id: string) => tasks.find((t) => t.id === id)?.status !== 'completed',
    ) ||
    task.data.checklist.some((c: any) => !c.completed) ||
    tasks.some((t) => t.parent_id === task.id && !['completed', 'cancelled'].includes(t.status))
  );
}
export function workQuickFilter(task: any, tasks: any[], filter: string, today: string) {
  if (filter === 'overdue') return task.status === 'open' && task.due_on && task.due_on < today;
  if (filter === 'priority') return ['high', 'urgent'].includes(task.data.priority);
  if (filter === 'blocked') return task.status === 'open' && workBlocked(task, tasks);
  if (filter === 'week') {
    const d = new Date(today + 'T00:00:00Z'),
      offset = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - offset);
    const start = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 6);
    return task.due_on && task.due_on >= start && task.due_on <= d.toISOString().slice(0, 10);
  }
  return true;
}

export function loadWorkDirectory(
  api: (path: string) => Promise<any>,
  onProjects: (result: any) => void,
  onMembers: (members: any[]) => void,
  onProjectError: (message: string) => void,
  onTeamError: (message: string) => void,
) {
  return Promise.allSettled([
    api('/work/projects')
      .then(onProjects)
      .catch((e) => onProjectError(e.message)),
    api('/team')
      .then((result) => onMembers(result.data))
      .catch((e) => onTeamError(e.message)),
  ]);
}
