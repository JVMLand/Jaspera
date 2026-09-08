import { estimatedSize } from './estimated-size';
import type { MethodGraph, Compilation } from './protocol';
import type { positionGraphs } from './graph-layout';
import { BoundedCache, defaultCacheBudget as budget } from './bounded-cache';

type Layout = Awaited<ReturnType<typeof positionGraphs>>;

export class MethodLayoutCache {
  private cache: BoundedCache<string, Layout>;

  constructor(private readonly bytes = budget) {
    this.cache = new BoundedCache(bytes, 256);
  }

  // Source positions and coloring do not affect geometry. IDs can change when labels
  // or line-number nodes are inserted, so compare topology by instruction order.
  private key(graph: MethodGraph) {
    const ids = new Map(graph.nodes.map((node, index) => [node.id, index]));
    const blockIds = [...new Set(graph.nodes.map((node) => node.block))];
    const blockIndices = new Map(blockIds.map((id, index) => [id, index]));
    for (const [index, id] of blockIds.entries())
      if (id !== undefined) ids.set(id, graph.nodes.length + index);
    return JSON.stringify([
      graph.name,
      graph.nodes.map((node) => [node.text, blockIndices.get(node.block)]),
      graph.edges.map((edge) => [ids.get(edge.from), ids.get(edge.to), edge.kind, edge.label]),
    ]);
  }

  get(graph: MethodGraph): Layout | undefined {
    const placed = this.cache.get(this.key(graph));
    if (!placed) return;
    const ids = new Map(
      placed.nodes.map((node, index) => [node.id, 'm0:' + graph.nodes[index].id]),
    );
    const blocks = [...new Set(graph.nodes.map((node) => node.block))];
    for (const [index, block] of [...new Set(placed.nodes.map((node) => node.block))].entries())
      ids.set('m0:' + block, 'm0:' + blocks[index]);
    return {
      ...placed,
      blocks: (placed.blocks ?? []).map((block) => ({ ...block, id: ids.get(block.id)! })),
      nodes: placed.nodes.map((node, index) => ({
        ...node,
        ...graph.nodes[index],
        id: 'm0:' + graph.nodes[index].id,
      })),
      edges: placed.edges.map((edge) => ({
        ...edge,
        from: ids.get(edge.from)!,
        to: ids.get(edge.to)!,
      })),
    };
  }

  set(graph: MethodGraph, placed: Layout) {
    const key = this.key(graph);
    this.cache.set(key, placed, key.length * 2 + estimatedSize(placed, this.bytes));
  }
}

export const methodLayouts = new MethodLayoutCache();
interface CachedGraph {
  owner: string;
  graphs: MethodGraph[];
}
export const graphDocuments = new BoundedCache<string, CachedGraph>(budget, 16);

export function rememberGraph(source: string, result: Compilation) {
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) return;
  const value = { owner: result.className, graphs: result.graphs ?? [] };
  graphDocuments.set(source, value, source.length * 2 + estimatedSize(value, budget));
}
