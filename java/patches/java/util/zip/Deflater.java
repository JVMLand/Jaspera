package java.util.zip;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Objects;
/** JALWeb adapter: OpenJDK API backed by BSD-licensed JZlib instead of native zlib. */
public class Deflater implements AutoCloseable {
 public static final int DEFLATED=8, NO_COMPRESSION=0, BEST_SPEED=1, BEST_COMPRESSION=9, DEFAULT_COMPRESSION=-1;
 public static final int FILTERED=1, HUFFMAN_ONLY=2, DEFAULT_STRATEGY=0, NO_FLUSH=0, SYNC_FLUSH=2, FULL_FLUSH=3;
 private com.jcraft.jzlib.Deflater engine;
 private final boolean nowrap;
 private int level,strategy;
 private boolean finishing,finished,parametersChanged;
 private ByteBuffer inputBuffer;
 public Deflater(int level,boolean nowrap){this.nowrap=nowrap;this.level=level;open();}
 public Deflater(int level){this(level,false);}
 public Deflater(){this(DEFAULT_COMPRESSION,false);}
 private void open(){engine=new com.jcraft.jzlib.Deflater();engine.next_in=new byte[0];if(engine.init(level,nowrap)!=0)throw new IllegalArgumentException("Invalid compression level");}
 private void ensureOpen(){if(engine==null)throw new NullPointerException("Deflater has been closed");}
 public synchronized void setInput(byte[] b,int off,int len){ensureOpen();Objects.checkFromIndexSize(off,len,b.length);engine.next_in=b;engine.next_in_index=off;engine.avail_in=len;inputBuffer=null;}
 public void setInput(byte[] b){setInput(b,0,b.length);}
 public synchronized void setInput(ByteBuffer b){byte[] bytes=new byte[b.remaining()];b.duplicate().get(bytes);setInput(bytes);inputBuffer=b;}
 public synchronized void setDictionary(byte[] b,int off,int len){ensureOpen();Objects.checkFromIndexSize(off,len,b.length);if(engine.setDictionary(Arrays.copyOfRange(b,off,off+len),len)!=0)throw new IllegalArgumentException("Invalid dictionary");}
 public void setDictionary(byte[] b){setDictionary(b,0,b.length);}
 public void setDictionary(ByteBuffer b){byte[] bytes=new byte[b.remaining()];b.get(bytes);setDictionary(bytes);}
 public synchronized void setStrategy(int s){if(s<0||s>2)throw new IllegalArgumentException("Invalid strategy");strategy=s;parametersChanged=true;}
 public synchronized void setLevel(int l){if(l< -1||l>9)throw new IllegalArgumentException("Invalid level");level=l;parametersChanged=true;}
 public synchronized boolean needsInput(){ensureOpen();return engine.avail_in==0;}
 public synchronized void finish(){finishing=true;}
 public synchronized boolean finished(){return finished;}
 boolean shouldFinish(){return finishing;}
 public int deflate(byte[] b){return deflate(b,0,b.length);}
 public int deflate(byte[] b,int off,int len){return deflate(b,off,len,NO_FLUSH);}
 public synchronized int deflate(byte[] b,int off,int len,int flush){
  ensureOpen();Objects.checkFromIndexSize(off,len,b.length);
  if(flush!=NO_FLUSH&&flush!=SYNC_FLUSH&&flush!=FULL_FLUSH)throw new IllegalArgumentException("Invalid flush mode");
  if(len==0||finished)return 0;
  engine.next_out=b;engine.next_out_index=off;engine.avail_out=len;
  int before=engine.avail_in;
  int result=0;
  if(parametersChanged){result=engine.params(level,strategy);parametersChanged=false;}
  if(result>=0)result=engine.deflate(finishing?4:flush);
  if(inputBuffer!=null)inputBuffer.position(inputBuffer.position()+before-engine.avail_in);
  if(result==1)finished=true;
  else if(result<0&&result!=-5)throw new IllegalStateException(engine.msg);
  return len-engine.avail_out;
 }
 public int deflate(ByteBuffer b){return deflate(b,NO_FLUSH);}
 public int deflate(ByteBuffer b,int flush){if(b.isReadOnly())throw new java.nio.ReadOnlyBufferException();byte[] bytes=new byte[b.remaining()];int n=deflate(bytes,0,bytes.length,flush);b.put(bytes,0,n);return n;}
 public synchronized int getAdler(){ensureOpen();return (int)engine.getAdler();}
 public int getTotalIn(){return (int)getBytesRead();}
 public synchronized long getBytesRead(){ensureOpen();return engine.total_in;}
 public int getTotalOut(){return (int)getBytesWritten();}
 public synchronized long getBytesWritten(){ensureOpen();return engine.total_out;}
 public synchronized void reset(){ensureOpen();engine.end();open();finishing=finished=false;inputBuffer=null;parametersChanged=strategy!=0;}
 public synchronized void end(){if(engine!=null){engine.end();engine=null;}inputBuffer=null;}
 public void close(){end();}
}
