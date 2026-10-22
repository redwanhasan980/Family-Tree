import { walkDescendants, type DescNode } from './descendants';

/** d'Aboville numbers by node key: 1, 1.1, 1.2, 1.1.1 … (LV-01). */
export function dAboville(root: DescNode): Map<string, string> {
  const numbers = new Map<string, string>([[root.key, '1']]);
  walkDescendants(root, (node) => {
    const own = numbers.get(node.key)!;
    node.children.forEach((child, index) => numbers.set(child.key, `${own}.${index + 1}`));
  });
  return numbers;
}

/**
 * Branch index by node key: which of the focus person's children each node descends
 * from (0, 1, 2 …), used for branch colours (DESIGN §21.3). The focus person has none.
 */
export function branchOf(root: DescNode): Map<string, number | null> {
  const branches = new Map<string, number | null>([[root.key, null]]);
  root.children.forEach((child, index) =>
    walkDescendants(child, (node) => branches.set(node.key, index)),
  );
  return branches;
}
