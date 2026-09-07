import type {CompilationService} from './compilation-service';
/** Keep recently inspected examples hot without retaining every source variant. */
export function usageCompiler(service:Pick<CompilationService,'compile'>,capacity:number){
 const documents=new Map<string,object>();
 return (source:string)=>{
  const document=documents.get(source)??{};documents.delete(source);documents.set(source,document);
  while(documents.size>Math.max(1,capacity))documents.delete(documents.keys().next().value!);
  return service.compile(document,source);
 };
}
