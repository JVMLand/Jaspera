package tokyo.peya.langjal.analyser;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.Opcodes;

/** Type relationships from the target JDK class files, never the host JDK's reflection types. */
public final class ClassHierarchy {
    private record Info(boolean contract, List<String> parents) {}
    private static final Map<String, Info> types = new HashMap<>();
    static {
        try (InputStream input = ClassHierarchy.class.getResourceAsStream("/langjal/hierarchy.tsv")) {
            if (input != null) for (String line : new String(input.readAllBytes(), StandardCharsets.UTF_8).split("\n")) {
                String[] fields = line.split("\t");
                types.put(fields[0], new Info(fields[1].equals("I"), Arrays.asList(fields).subList(2, fields.length)));
            }
        } catch (IOException e) { throw new ExceptionInInitializerError(e); }
    }
    private static Info info(String name) {
        Info result = types.get(name);
        if (result != null) return result;
        try (InputStream input = ClassHierarchy.class.getResourceAsStream("/" + name + ".class")) {
            if (input != null) {
                ClassReader reader = new ClassReader(input);
                List<String> parents = new ArrayList<>(Arrays.asList(reader.getInterfaces()));
                if (reader.getSuperName() != null) parents.add(reader.getSuperName());
                result = new Info((reader.getAccess() & Opcodes.ACC_INTERFACE) != 0, parents);
                types.put(name, result);
            }
        } catch (IOException ignored) { }
        return result;
    }
    private static Set<String> ancestors(String name) {
        Set<String> seen = new LinkedHashSet<>(); ArrayDeque<String> queue = new ArrayDeque<>(); queue.add(name);
        while (!queue.isEmpty()) {String next = queue.remove(); if (!seen.add(next)) continue; Info type = info(next); if (type != null) queue.addAll(type.parents());}
        seen.add("java/lang/Object"); return seen;
    }
    public static String common(String first, String second) {
        if (first.equals(second)) return first;
        if (info(first) == null || info(second) == null) return first;
        Set<String> left = ancestors(first), right = ancestors(second);
        if (left.contains(second)) return second;
        if (right.contains(first)) return first;
        left.retainAll(right);
        List<String> specific = left.stream().filter(candidate -> left.stream().noneMatch(sub -> !sub.equals(candidate) && ancestors(sub).contains(candidate))).toList();
        if (specific.size() == 1) return specific.get(0);
        return left.stream().filter(name -> !name.equals("java/lang/Object") && info(name) != null && !info(name).contract()).findFirst().orElse("java/lang/Object");
    }
    public static void main(String[] args) throws Exception {
        List<String> rows = new ArrayList<>();
        try (ZipFile zip = new ZipFile(args[0])) {
            var entries = zip.entries();
            while (entries.hasMoreElements()) {var entry = entries.nextElement(); if (!entry.getName().endsWith(".class") || entry.getName().equals("module-info.class")) continue;
                ClassReader reader = new ClassReader(zip.getInputStream(entry));
                List<String> row = new ArrayList<>();row.add(reader.getClassName());row.add((reader.getAccess() & Opcodes.ACC_INTERFACE) != 0 ? "I" : "C");
                if (reader.getSuperName() != null) row.add(reader.getSuperName());row.addAll(Arrays.asList(reader.getInterfaces()));rows.add(String.join("\t", row));
            }
        }
        Collections.sort(rows); Files.writeString(Path.of(args[1]), String.join("\n", rows), StandardCharsets.UTF_8);
    }
}
