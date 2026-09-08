import java.io.*;
import java.math.*;
import java.nio.*;
import java.nio.charset.*;
import java.security.*;
import java.text.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.regex.*;
import java.util.stream.*;

public class StandardLibraryProbe {

    static void eq(Object actual, Object expected) {
        if (!Objects.equals(actual, expected)) throw new AssertionError(actual + " != " + expected);
    }

    public static void main(String[] args) {
        try {
            eq(new StringBuilder("日本語").append(42).toString(), "日本語42");
            eq(Math.sqrt(81), 9.0);
            eq(Integer.parseInt("42"), 42);
            System.out.println("PASS lang");
        } catch (Throwable e) {
            System.out.println("FAIL lang: " + e);
        }
        try {
            List<String> list = new ArrayList<>(List.of("c", "a", "b"));
            Collections.sort(list);
            eq(String.join(",", list), "a,b,c");
            Map<String, Integer> map = new HashMap<>();
            map.put("a", 1);
            eq(map.get("a"), 1);
            eq(new HashSet<>(list).size(), 3);
            System.out.println("PASS collections");
        } catch (Throwable e) {
            System.out.println("FAIL collections: " + e);
        }
        try {
            eq(
                IntStream.range(0, 10)
                    .filter(i -> i % 2 == 0)
                    .sum(),
                20
            );
            System.out.println("PASS streams");
        } catch (Throwable e) {
            System.out.println("FAIL streams: " + e);
        }
        try {
            eq(Pattern.compile("[a-z]+\\d+").matcher("abc42").matches(), true);
            eq("a,b,c".split(",").length, 3);
            System.out.println("PASS regex");
        } catch (Throwable e) {
            System.out.println("FAIL regex: " + e);
        }
        try {
            eq(
                new BigInteger("12345678901234567890").multiply(BigInteger.TWO).toString(),
                "24691357802469135780"
            );
            eq(new BigDecimal("1.25").add(new BigDecimal("2.50")).toPlainString(), "3.75");
            System.out.println("PASS math");
        } catch (Throwable e) {
            System.out.println("FAIL math: " + e);
        }
        try {
            eq(LocalDate.of(2024, 2, 28).plusDays(2).toString(), "2024-03-01");
            eq(Duration.ofMinutes(2).toSeconds(), 120L);
            eq(
                ZoneId.of("Asia/Tokyo").getRules().getOffset(Instant.EPOCH).getTotalSeconds(),
                32400
            );
            eq(Instant.ofEpochSecond(0).toString(), "1970-01-01T00:00:00Z");
            System.out.println("PASS time");
        } catch (Throwable e) {
            System.out.println("FAIL time: " + e);
        }
        try {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            new DataOutputStream(b).writeInt(42);
            eq(new DataInputStream(new ByteArrayInputStream(b.toByteArray())).readInt(), 42);
            eq(new BufferedReader(new StringReader("one\ntwo")).readLine(), "one");
            System.out.println("PASS io");
        } catch (Throwable e) {
            System.out.println("FAIL io: " + e);
        }
        try {
            ByteBuffer b = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
            b.putLong(123456789L);
            b.flip();
            eq(b.getLong(), 123456789L);
            eq(
                StandardCharsets.UTF_8.decode(StandardCharsets.UTF_8.encode("日本語")).toString(),
                "日本語"
            );
            System.out.println("PASS nio");
        } catch (Throwable e) {
            System.out.println("FAIL nio: " + e);
        }
        try {
            eq(
                HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(
                        "abc".getBytes(StandardCharsets.UTF_8)
                    )
                ),
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
            );
            System.out.println("PASS security");
        } catch (Throwable e) {
            System.out.println("FAIL security: " + e);
        }
        try {
            eq(new java.net.URI("https://example.org/a?b=c").getHost(), "example.org");
            System.out.println("PASS net-uri");
        } catch (Throwable e) {
            System.out.println("FAIL net-uri: " + e);
        }
        try {
            eq(
                new MessageFormat("Hello {0}", Locale.ROOT).format(new Object[] { "JAL" }),
                "Hello JAL"
            );
            System.out.println("PASS text");
        } catch (Throwable e) {
            System.out.println("FAIL text: " + e);
        }
        try {
            AtomicInteger i = new AtomicInteger();
            Thread t = new Thread(() -> i.incrementAndGet());
            t.start();
            t.join();
            eq(i.get(), 1);
            eq(
                CompletableFuture.completedFuture(5)
                    .thenApply(x -> x + 1)
                    .join(),
                6
            );
            System.out.println("PASS concurrency");
        } catch (Throwable e) {
            System.out.println("FAIL concurrency: " + e);
        }
        try {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            try (var z = new java.util.zip.GZIPOutputStream(b)) {
                z.write("hello".getBytes(StandardCharsets.UTF_8));
            }
            try (
                var z = new java.util.zip.GZIPInputStream(new ByteArrayInputStream(b.toByteArray()))
            ) {
                eq(new String(z.readAllBytes(), StandardCharsets.UTF_8), "hello");
            }
            System.out.println("PASS zip");
        } catch (Throwable e) {
            System.out.println("FAIL zip: " + e);
        }
    }
}
