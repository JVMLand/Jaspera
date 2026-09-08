package java.util.zip;

import java.nio.ByteBuffer;
import java.util.Objects;

/** JALWeb adapter for JZlib's pure-Java checksum implementation. */
public class CRC32 implements Checksum {

    private final com.jcraft.jzlib.CRC32 engine = new com.jcraft.jzlib.CRC32();

    public void update(int b) {
        engine.update(new byte[] { (byte) b }, 0, 1);
    }

    public void update(byte[] b, int off, int len) {
        Objects.checkFromIndexSize(off, len, b.length);
        engine.update(b, off, len);
    }

    public void update(byte[] b) {
        update(b, 0, b.length);
    }

    public void update(ByteBuffer b) {
        byte[] bytes = new byte[Math.min(b.remaining(), 8192)];
        while (b.hasRemaining()) {
            int n = Math.min(b.remaining(), bytes.length);
            b.get(bytes, 0, n);
            update(bytes, 0, n);
        }
    }

    public long getValue() {
        return engine.getValue();
    }

    public void reset() {
        engine.reset();
    }
}
