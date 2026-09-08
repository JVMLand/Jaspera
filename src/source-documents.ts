import type { Project } from './project';
interface SourceModel {
  getValue(): string;
  dispose(): void;
}
/** Owns path changes and removal of every reference to a source document. */
export class SourceDocuments<M extends SourceModel, S> {
  constructor(
    private readonly state: {
      project: () => Project;
      models: Map<string, M>;
      closed: Set<string>;
      groups: Map<string, S>;
      order: () => string[];
      setOrder: (order: string[]) => void;
      results: { delete(path: string): unknown };
      create: (path: string, source: string) => M;
      removeView: (key: string, model: M | undefined) => void;
      replaceView: (from: string, to: string, model: M, next: M) => void;
    },
  ) {}
  add(path: string, source: string) {
    const s = this.state,
      project = s.project();
    if (s.models.has(path) || project.files.some((f) => f.path === path))
      throw new Error('Document already exists: ' + path);
    const model = s.create(path, source);
    project.files.push({ path, source });
    if (project.files.length === 1) project.workspace.entryFile = path;
    return model;
  }
  remove(path: string) {
    const s = this.state,
      project = s.project(),
      model = s.models.get(path),
      key = 'source:' + path;
    project.files = project.files.filter((f) => f.path !== path);
    const fallback = project.files[0]?.path ?? '';
    if (project.workspace.entryFile === path) project.workspace.entryFile = fallback;
    if (project.workspace.activeFile === path) project.workspace.activeFile = fallback;
    delete project.workspace.views[path];
    s.closed.delete(path);
    s.groups.delete(key);
    s.setOrder(s.order().filter((value) => value !== key));
    s.results.delete(path);
    s.models.delete(path);
    s.removeView(key, model);
    model?.dispose();
  }
  rename(from: string, to: string) {
    if (from === to) return;
    const s = this.state,
      project = s.project(),
      model = s.models.get(from);
    const file = project.files.find((f) => f.path === from);
    if (!file || !model) throw new Error('Unknown document: ' + from);
    if (s.models.has(to)) throw new Error('Document already exists: ' + to);
    const source = model.getValue(),
      next = s.create(to, source);
    file.path = to;
    file.source = source;
    if (project.workspace.entryFile === from) project.workspace.entryFile = to;
    if (project.workspace.activeFile === from) project.workspace.activeFile = to;
    if (project.workspace.views[from]) project.workspace.views[to] = project.workspace.views[from];
    delete project.workspace.views[from];
    if (s.closed.delete(from)) s.closed.add(to);
    const key = 'source:' + from,
      nextKey = 'source:' + to;
    const group = s.groups.get(key);
    s.groups.delete(key);
    if (group !== undefined) s.groups.set(nextKey, group);
    s.setOrder(s.order().map((value) => (value === key ? nextKey : value)));
    s.results.delete(from);
    s.models.delete(from);
    s.replaceView(key, nextKey, model, next);
    model.dispose();
  }
}
