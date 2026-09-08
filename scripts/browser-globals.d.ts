export {};
declare global {
  interface Window {
    longTasks: { start: number; duration: number }[];
    jalwebDetached: {
      compileUsage(source: string): Promise<{ diagnostics: { severity: string }[] }>;
    };
  }
  interface Navigator {
    readonly deviceMemory?: number;
  }
}
