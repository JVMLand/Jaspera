package java.util.zip;

import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Objects;

/** JALWeb adapter: OpenJDK API backed by BSD-licensed JZlib instead of native zlib. */
public class Inflater implements AutoCloseable {

    private com.jcraft.jzlib.Inflater engine;
    private final boolean nowrap;
    private boolean finished, dictionary, pendingOutput;
    private ByteBuffer inputBuffer;

    public Inflater(boolean nowrap) {
        this.nowrap = nowrap;
        open();
    }

    public Inflater() {
        this(false);
    }

    private void open() {
        try {
            engine = new com.jcraft.jzlib.Inflater(nowrap);
            engine.next_in = new byte[0];
        } catch (com.jcraft.jzlib.GZIPException e) {
            throw new IllegalArgumentException(e);
        }
    }

    private void ensureOpen() {
        if (engine == null) throw new NullPointerException("Inflater has been closed");
    }

    public synchronized void setInput(byte[] b, int off, int len) {
        ensureOpen();
        Objects.checkFromIndexSize(off, len, b.length);
        engine.next_in = b;
        engine.next_in_index = off;
        engine.avail_in = len;
        inputBuffer = null;
    }

    public void setInput(byte[] b) {
        setInput(b, 0, b.length);
    }

    public synchronized void setInput(ByteBuffer b) {
        byte[] bytes = new byte[b.remaining()];
        b.duplicate().get(bytes);
        setInput(bytes);
        inputBuffer = b;
    }

    public synchronized void setDictionary(byte[] b, int off, int len) {
        ensureOpen();
        Objects.checkFromIndexSize(off, len, b.length);
        if (
            engine.setDictionary(Arrays.copyOfRange(b, off, off + len), len) != 0
        ) throw new IllegalArgumentException("Invalid dictionary");
        dictionary = false;
    }

    public void setDictionary(byte[] b) {
        setDictionary(b, 0, b.length);
    }

    public void setDictionary(ByteBuffer b) {
        byte[] bytes = new byte[b.remaining()];
        b.get(bytes);
        setDictionary(bytes);
    }

    public synchronized int getRemaining() {
        ensureOpen();
        return engine.avail_in;
    }

    public boolean needsInput() {
        return getRemaining() == 0;
    }

    public synchronized boolean needsDictionary() {
        return dictionary;
    }

    public synchronized boolean finished() {
        return finished;
    }

    public int inflate(byte[] b) throws DataFormatException {
        return inflate(b, 0, b.length);
    }

    public synchronized int inflate(byte[] b, int off, int len) throws DataFormatException {
        ensureOpen();
        Objects.checkFromIndexSize(off, len, b.length);
        if (len == 0 || finished) return 0;
        engine.next_out = b;
        engine.next_out_index = off;
        engine.avail_out = len;
        int before = engine.avail_in;
        int result = engine.inflate(0);
        if (inputBuffer != null) inputBuffer.position(
            inputBuffer.position() + before - engine.avail_in
        );
        if (result == 1) finished = true;
        else if (result == 2) dictionary = true;
        else if (result < 0 && result != -5) throw new DataFormatException(engine.msg);
        pendingOutput = engine.avail_out == 0 && !finished;
        return len - engine.avail_out;
    }

    public int inflate(ByteBuffer b) throws DataFormatException {
        if (b.isReadOnly()) throw new java.nio.ReadOnlyBufferException();
        byte[] bytes = new byte[b.remaining()];
        int n = inflate(bytes);
        b.put(bytes, 0, n);
        return n;
    }

    public synchronized int getAdler() {
        ensureOpen();
        return (int) engine.getAdler();
    }

    public int getTotalIn() {
        return (int) getBytesRead();
    }

    public synchronized long getBytesRead() {
        ensureOpen();
        return engine.total_in;
    }

    public int getTotalOut() {
        return (int) getBytesWritten();
    }

    public synchronized long getBytesWritten() {
        ensureOpen();
        return engine.total_out;
    }

    public synchronized void reset() {
        ensureOpen();
        engine.end();
        open();
        finished = dictionary = pendingOutput = false;
        inputBuffer = null;
    }

    public synchronized void end() {
        if (engine != null) {
            engine.end();
            engine = null;
        }
        inputBuffer = null;
    }

    public void close() {
        end();
    }

    boolean hasPendingOutput() {
        return pendingOutput;
    }
}
