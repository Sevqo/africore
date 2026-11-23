export function moveWebsiteBlock<T>(blocks: readonly T[], from: number, to: number): T[] {
  const result = [...blocks];
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= result.length ||
    to >= result.length ||
    from === to
  )
    return result;
  const [block] = result.splice(from, 1);
  result.splice(to, 0, block);
  return result;
}

export function moveWebsiteBlockSelection(
  selected: number | undefined,
  from: number,
  to: number,
): number | undefined {
  if (selected === undefined || from === to) return selected;
  if (selected === from) return to;
  if (from < selected && to >= selected) return selected - 1;
  if (from > selected && to <= selected) return selected + 1;
  return selected;
}
