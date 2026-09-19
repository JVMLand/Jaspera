import type { Project } from './project';
import { validateProject } from './project';
export const draftKey = 'jaspera.draft.v1';
export interface Draft {
  version: 1;
  project: Project;
  examples: Record<string, string>;
  dirty: boolean;
}
export function readDraft(storage: Pick<Storage, 'getItem'>): Draft | undefined {
  const raw = storage.getItem(draftKey);
  if (!raw) return;
  const data = JSON.parse(raw);
  if (
    data?.version !== 1 ||
    typeof data.dirty !== 'boolean' ||
    !data.examples ||
    typeof data.examples !== 'object' ||
    Array.isArray(data.examples) ||
    Object.values(data.examples).some((value) => typeof value !== 'string')
  )
    throw new Error('Invalid draft');
  return {
    version: 1,
    project: validateProject(data.project, false),
    examples: data.examples,
    dirty: data.dirty,
  };
}
/** Failed writes keep the previous draft. Report once until a write succeeds. */
export function draftWriter(storage: () => Pick<Storage, 'setItem'>, onError: () => void) {
  let failed = false;
  return (draft: Draft) => {
    try {
      storage().setItem(draftKey, JSON.stringify(draft));
      failed = false;
      return true;
    } catch {
      if (!failed) {
        failed = true;
        onError();
      }
      return false;
    }
  };
}
