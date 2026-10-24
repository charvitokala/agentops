export const NOTE_ATTRIBUTE = "data-verdictai-note";

export function isOwnedMutation(record: MutationRecord): boolean {
  const element =
    record.target.nodeType === 1
      ? (record.target as Element)
      : record.target.parentElement;
  if (element?.closest(`[${NOTE_ATTRIBUTE}]`)) return true;
  const nodes = [...record.addedNodes, ...record.removedNodes];
  return (
    record.type === "childList" &&
    nodes.length > 0 &&
    nodes.every(
      (node) =>
        node.nodeType === 1 && (node as Element).hasAttribute(NOTE_ATTRIBUTE),
    )
  );
}
