package mcsrc;

import net.fabricmc.mappingio.MappedElementKind;
import net.fabricmc.mappingio.MappingReader;
import net.fabricmc.mappingio.MappingUtil;
import net.fabricmc.mappingio.MappingVisitor;
import net.fabricmc.mappingio.format.MappingFormat;
import net.fabricmc.mappingio.format.enigma.EnigmaFileReader;
import net.fabricmc.mappingio.format.enigma.EnigmaFileWriter;
import net.fabricmc.mappingio.format.tiny.Tiny2FileReader;
import net.fabricmc.mappingio.format.tiny.Tiny2FileWriter;
import net.fabricmc.mappingio.tree.MappingTree;
import net.fabricmc.mappingio.tree.MemoryMappingTree;
import net.fabricmc.mappingio.tree.VisitOrder;

import java.io.IOException;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class JavadocMappings {
    public static final int CLASS = 0;
    public static final int FIELD = 1;
    public static final int METHOD = 2;

    private static final String OFFICIAL_NAMESPACE = "official";
    private static MemoryMappingTree tree;

    private JavadocMappings() {
    }

    public static String read(byte[] bytes) throws IOException {
        if (bytes.length == 0) throw new IOException("Javadoc mapping file is empty");

        String text = new String(bytes, StandardCharsets.UTF_8);
        MappingFormat format = MappingReader.detectFormat(new StringReader(text));
        if (format == null) throw new IOException("Unsupported Javadoc mapping format");

        MemoryMappingTree nextTree = new MemoryMappingTree();
        switch (format) {
            case TINY_2_FILE -> Tiny2FileReader.read(new StringReader(text), nextTree);
            case ENIGMA_FILE -> EnigmaFileReader.read(new StringReader(text), nextTree);
            default -> throw new IOException("Unsupported Javadoc mapping format: " + format);
        }

        if (format == MappingFormat.TINY_2_FILE && !OFFICIAL_NAMESPACE.equals(nextTree.getSrcNamespace())) {
            throw new IOException("Tiny v2 Javadoc mappings must use the official source namespace");
        }

        tree = nextTree;
        return format == MappingFormat.TINY_2_FILE ? "tiny2" : "enigma";
    }

    public static String[] readDirectory(byte[][] files, String[] paths) throws IOException {
        if (files.length != paths.length) throw new IllegalArgumentException("File and path counts differ");

        MemoryMappingTree nextTree = newEnigmaTree();
        String[] owners = new String[files.length];
        Set<String> seenOwners = new HashSet<>();

        for (int i = 0; i < files.length; i++) {
            MemoryMappingTree fileTree = new MemoryMappingTree();

            try {
                EnigmaFileReader.read(new StringReader(new String(files[i], StandardCharsets.UTF_8)), fileTree);
            } catch (IOException | RuntimeException e) {
                throw new IOException("Invalid Enigma mapping file " + paths[i] + ": " + e.getMessage(), e);
            }

            String owner = null;

            for (MappingTree.ClassMapping clazz : fileTree.getClasses()) {
                String classOwner = outerClassName(clazz.getSrcName());

                if (owner == null) {
                    owner = classOwner;
                } else if (!owner.equals(classOwner)) {
                    throw new IOException("Enigma mapping file " + paths[i] + " contains multiple outer classes");
                }
            }

            if (owner == null) throw new IOException("Enigma mapping file " + paths[i] + " is empty");
            if (!seenOwners.add(owner)) throw new IOException("Duplicate Enigma mapping for " + owner);

            String expectedPath = owner + ".mapping";

            if (!expectedPath.equals(paths[i])) {
                throw new IOException("Enigma mapping path " + paths[i]
                        + " does not match class " + owner + " (expected " + expectedPath + ")");
            }

            owners[i] = owner;
            for (MappingTree.ClassMapping clazz : fileTree.getClasses()) {
                nextTree.addClass(clazz);
            }
        }

        tree = nextTree;
        return owners;
    }

    public static byte[] create(String format) throws IOException {
        return write(format, newTree());
    }

    public static void reset() {
        tree = newTree();
    }

    public static String get(int kind, String owner, String name, String descriptor) {
        if (tree == null) return null;

        MappingTree.ClassMapping clazz = tree.getClass(owner);
        if (clazz == null) return null;

        return switch (kind) {
            case CLASS -> clazz.getComment();
            case FIELD -> {
                MappingTree.FieldMapping field = clazz.getField(name, descriptor);
                yield field == null ? null : field.getComment();
            }
            case METHOD -> {
                MappingTree.MethodMapping method = clazz.getMethod(name, descriptor);
                yield method == null ? null : method.getComment();
            }
            default -> throw new IllegalArgumentException("Unsupported Javadoc element kind: " + kind);
        };
    }

    public static void set(int kind, String owner, String name, String descriptor, String comment) throws IOException {
        if (tree == null) throw new IllegalStateException("No Javadoc mappings are active");
        if (comment != null && comment.isEmpty()) comment = null;

        MappingTree.ClassMapping clazz = tree.getClass(owner);
        if (comment == null) {
            if (clazz == null) return;

            switch (kind) {
                case CLASS -> clazz.setComment(null);
                case FIELD -> {
                    MappingTree.FieldMapping field = clazz.getField(name, descriptor);
                    if (field != null) field.setComment(null);
                }
                case METHOD -> {
                    MappingTree.MethodMapping method = clazz.getMethod(name, descriptor);
                    if (method != null) method.setComment(null);
                }
                default -> throw new IllegalArgumentException("Unsupported Javadoc element kind: " + kind);
            }

            pruneEmptyEntries(clazz, kind, name, descriptor);

            return;
        }

        try {
            tree.visitClass(owner);
            tree.visitElementContent(MappedElementKind.CLASS);

            switch (kind) {
                case CLASS -> tree.visitComment(MappedElementKind.CLASS, comment);
                case FIELD -> {
                    tree.visitField(name, descriptor);
                    tree.visitElementContent(MappedElementKind.FIELD);
                    tree.visitComment(MappedElementKind.FIELD, comment);
                }
                case METHOD -> {
                    tree.visitMethod(name, descriptor);
                    tree.visitElementContent(MappedElementKind.METHOD);
                    tree.visitComment(MappedElementKind.METHOD, comment);
                }
                default -> throw new IllegalArgumentException("Unsupported Javadoc element kind: " + kind);
            }
        } finally {
            tree.visitEnd();
        }
    }

    public static byte[] write(String format) throws IOException {
        if (tree == null) throw new IllegalStateException("No Javadoc mappings are active");
        return write(format, tree);
    }

    public static byte[] writeClass(String owner) throws IOException {
        if (tree == null) throw new IllegalStateException("No Javadoc mappings are active");

        String outerOwner = outerClassName(owner);
        MemoryMappingTree classTree = new MemoryMappingTree(tree);
        List<String> remove = new ArrayList<>();

        for (MappingTree.ClassMapping clazz : classTree.getClasses()) {
            if (!outerOwner.equals(outerClassName(clazz.getSrcName())) || !isMeaningful(clazz)) {
                remove.add(clazz.getSrcName());
            }
        }

        remove.forEach(classTree::removeClass);
        if (classTree.getClasses().isEmpty()) return new byte[0];

        return write("enigma", classTree);
    }

    private static byte[] write(String format, MemoryMappingTree source) throws IOException {
        StringWriter output = new StringWriter();
        MappingVisitor writer = switch (format) {
            case "tiny2" -> new Tiny2FileWriter(output, false);
            case "enigma" -> new EnigmaFileWriter(output);
            default -> throw new IOException("Unsupported Javadoc mapping format: " + format);
        };
        source.accept(writer, VisitOrder.createByName().classesBySrcNameShortFirst());
        return output.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static MemoryMappingTree newTree() {
        MemoryMappingTree result = new MemoryMappingTree();
        result.visitNamespaces(OFFICIAL_NAMESPACE, List.of());
        result.visitEnd();
        return result;
    }

    private static MemoryMappingTree newEnigmaTree() {
        MemoryMappingTree result = new MemoryMappingTree();
        result.visitNamespaces(MappingUtil.NS_SOURCE_FALLBACK, List.of(MappingUtil.NS_TARGET_FALLBACK));
        result.visitEnd();
        return result;
    }

    private static void pruneEmptyEntries(MappingTree.ClassMapping clazz, int kind, String name, String descriptor) {
        if (kind == FIELD) {
            MappingTree.FieldMapping field = clazz.getField(name, descriptor);
            if (field != null && !isMeaningful(field)) clazz.removeField(name, descriptor);
        } else if (kind == METHOD) {
            MappingTree.MethodMapping method = clazz.getMethod(name, descriptor);
            if (method != null && !isMeaningful(method)) clazz.removeMethod(name, descriptor);
        }

        if (!isMeaningful(clazz)) tree.removeClass(clazz.getSrcName());
    }

    private static boolean isMeaningful(MappingTree.ClassMapping clazz) {
        if (hasContent(clazz)) return true;
        if (clazz.getFields().stream().anyMatch(JavadocMappings::isMeaningful)) return true;
        return clazz.getMethods().stream().anyMatch(JavadocMappings::isMeaningful);
    }

    private static boolean isMeaningful(MappingTree.FieldMapping field) {
        return hasContent(field);
    }

    private static boolean isMeaningful(MappingTree.MethodMapping method) {
        if (hasContent(method)) return true;
        return method.getArgs().stream().anyMatch(JavadocMappings::hasContent);
    }

    private static boolean hasContent(MappingTree.ElementMapping element) {
        if (element.getComment() != null) return true;

        for (int namespace = 0; namespace < element.getTree().getMaxNamespaceId(); namespace++) {
            if (element.getDstName(namespace) != null) return true;
        }

        return false;
    }

    private static String outerClassName(String name) {
        int start = 0;

        while (true) {
            int separator = name.indexOf('$', start);
            if (separator < 0) return name;
            if (separator == 0 || name.charAt(separator - 1) != '/') return name.substring(0, separator);
            start = separator + 1;
        }
    }
}
