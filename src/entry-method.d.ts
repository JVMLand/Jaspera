export interface EntryMethods {
  owner: string;
  parent: string;
  abstract: boolean;
  constructors: string[];
  methods: { descriptor: string; static: boolean; abstract: boolean }[];
}
export function entryMethods(source: string): EntryMethods;
export function entryProblem(
  entry: EntryMethods | undefined,
  classes?: EntryMethods[],
): '' | 'run.noMain' | 'run.abstractMain' | 'run.noConstructor';
