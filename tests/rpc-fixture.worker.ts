import {expose,transfer} from 'comlink';
expose({
 async delay(value:number,ms:number){await new Promise(r=>setTimeout(r,ms));return value;},
 fail(){throw new Error('fixture failure');},
 bytes(){const bytes=new Uint8Array([1,2,3]);return transfer(bytes,[bytes.buffer]);},
 crash(){setTimeout(()=>{throw new Error('fixture crash');},0);return new Promise(()=>{});},
 hang(){while(true){/* Terminated by the client timeout. */}}
});
