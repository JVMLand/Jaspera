import type {DebugBreakpoint,DebugCommand,DebugLocation,DebugOptions,DebugSnapshot,DebugFrame} from './debug-protocol';
/** This controller runs in the JVM worker. It never evaluates Java code. */
export class RuntimeDebugger {
 paused=false;
 frames:DebugFrame[]=[];
 private mode:DebugCommand|'entry'='entry';
 private location?:DebugLocation;
 private skips=new Map<number,DebugLocation>();
 private reason:DebugSnapshot['reason']='entry';
 private points=new Set<string>();
 private rootDepths=new Map<number,number>();
 private classes:Set<string>;
 constructor(private vm:any,options:DebugOptions,private publishSnapshot:(snapshot:DebugSnapshot)=>void){
  this.classes=new Set(options.classes);this.breakpoints(options.breakpoints);
  const module=vm._module;
  if(!module._jaspera_debug_enable)throw new Error('デバッガ対応 JVM がありません。pnpm run build:runtime を実行してください。');
  module.jasperaDebugger=this;
  module._jaspera_debug_enable(vm.getActiveThread().ptr);
 }
 breakpoints(points:DebugBreakpoint[]){this.points=new Set(points.map(p=>p.className+':'+p.line));}
 check=(where:DebugLocation)=>{
  // Internal resolution may redispatch an opcode. Only an executed instruction
  // (including a self-loop) or a different frame can finish a step.
  const skip=this.skips.get(where.thread);
  if(skip){if(skip.frame===where.frame&&skip.pc===where.pc&&skip.sequence===where.sequence)return false;this.skips.delete(where.thread);}
  const user=this.classes.has(where.className),previous=this.location;
  const rootDepth=Math.min(this.rootDepths.get(where.thread)??Infinity,user?where.depth:Infinity);
  this.rootDepths.set(where.thread,rootDepth);
  if(where.depth<rootDepth)return false;
  let reason:DebugSnapshot['reason']|undefined;
  if(user&&this.points.has(where.className+':'+where.line))reason='breakpoint';
  else if(this.mode==='entry'&&user)reason='entry';
  else if(this.mode==='pause'&&user)reason='pause';
  else if(previous&&where.thread===previous.thread){
   if(this.mode==='into')reason='step';
   else if(this.mode==='over'&&where.depth<=previous.depth)reason='step';
   else if(this.mode==='out'&&where.depth<previous.depth)reason='step';
  }
  if(!reason)return false;
  this.location=where;this.reason=reason;this.frames=[];this.paused=true;return true;
 };
 publish=()=>this.publishSnapshot({location:this.location!,frames:this.frames.slice(0,this.location!.depth-this.rootDepths.get(this.location!.thread)!+1),reason:this.reason});
 command(command:DebugCommand){
  if(command==='pause'){if(!this.paused)this.mode='pause';return;}
  if(!this.paused)throw new Error('JVM は停止していません。');
  this.mode=command;this.skips.set(this.location!.thread,this.location!);this.paused=false;this.vm.scheduleTimeout();
 }
}
