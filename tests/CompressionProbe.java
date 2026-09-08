import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;

public class CompressionProbe {

    static void require(boolean value) {
        if (!value) throw new AssertionError("Compression check failed");
    }

    static byte[] unpack(byte[] bytes) throws Exception {
        try (var in = new GZIPInputStream(new ByteArrayInputStream(bytes), 11)) {
            return in.readAllBytes();
        }
    }

    public static void main(String[] args) throws Exception {
        byte[] payload = new byte[8192];
        for (int i = 0; i < payload.length; i++) payload[i] = (byte) (i % 251);
        var b = new ByteArrayOutputStream();
        try (var z = new GZIPOutputStream(b, 17, true)) {
            z.write(payload, 0, 123);
            z.flush();
            z.write(payload, 123, payload.length - 123);
        }
        require(Arrays.equals(unpack(b.toByteArray()), payload));
        System.out.println("GZIP " + Base64.getEncoder().encodeToString(b.toByteArray()));
        var empty = new ByteArrayOutputStream();
        try (var z = new GZIPOutputStream(empty)) {
        }
        require(unpack(empty.toByteArray()).length == 0);
        var zipBytes = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(zipBytes)) {
            zip.putNextEntry(new ZipEntry("test.txt"));
            zip.write(payload);
            zip.closeEntry();
        }
        try (var zip = new ZipInputStream(new ByteArrayInputStream(zipBytes.toByteArray()))) {
            require(zip.getNextEntry().getName().equals("test.txt"));
            require(Arrays.equals(zip.readAllBytes(), payload));
            require(zip.getNextEntry() == null);
        }
        var def = new Deflater();
        var inf = new Inflater();
        byte[] compressed = new byte[16384];
        byte[] restored = new byte[8192];
        for (int round = 0; round < 2; round++) {
            ByteBuffer input = ByteBuffer.wrap(payload);
            def.setInput(input);
            def.finish();
            ByteBuffer output = ByteBuffer.wrap(compressed);
            int count = def.deflate(output);
            require(input.position() == payload.length);
            require(output.position() == count);
            require(def.finished());
            inf.setInput(compressed, 0, count);
            int read = inf.inflate(restored);
            require(read == payload.length);
            require(Arrays.equals(payload, restored));
            require(inf.finished());
            def.reset();
            inf.reset();
        }
        byte[] dictionary = "hello world common dictionary".getBytes(StandardCharsets.UTF_8);
        byte[] content = "hello world hello world".getBytes(StandardCharsets.UTF_8);
        def.setDictionary(dictionary);
        def.setInput(content);
        def.finish();
        int n = def.deflate(compressed);
        inf.setInput(compressed, 0, n);
        inf.inflate(restored);
        require(inf.needsDictionary());
        inf.setDictionary(dictionary);
        n = inf.inflate(restored);
        require(Arrays.equals(Arrays.copyOf(restored, n), content));
        def.end();
        inf.end();
        var crc = new CRC32();
        crc.update("123456789".getBytes(StandardCharsets.UTF_8));
        require(crc.getValue() == 0xcbf43926L);
        var adler = new Adler32();
        adler.update("Wikipedia".getBytes(StandardCharsets.UTF_8));
        require(adler.getValue() == 0x11e60398L);
        System.out.println("PASS compression");
    }
}
