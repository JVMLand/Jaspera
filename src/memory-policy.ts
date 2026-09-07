/** deviceMemory is a rounded capacity hint, not currently available RAM. */
export function memoryPolicy(deviceMemory?:number){
 const low=typeof deviceMemory==='number'&&Number.isFinite(deviceMemory)&&deviceMemory>0&&deviceMemory<=4;
 return {analysisHeapMiB:low?32:64,executionHeapMiB:low?64:128,usageCacheEntries:low?8:24,backgroundIdleMs:low?30_000:60_000};
}
