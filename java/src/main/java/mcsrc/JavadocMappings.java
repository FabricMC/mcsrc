package mcsrc;

import net.fabricmc.mappingio.MappedElementKind;
import net.fabricmc.mappingio.MappingReader;
import net.fabricmc.mappingio.MappingUtil;
import net.fabricmc.mappingio.MappingVisitor;
import net.fabricmc.mappingio.adapter.ForwardingMappingVisitor;
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
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class JavadocMappings {
    public enum ElementKind {
        CLASS,
        FIELD,
        METHOD
    }

    private static final String OFFICIAL_NAMESPACE = "official";
    private MemoryMappingTree tree = newTree();
    private MemoryMappingTree pendingDirectoryTree;
    private Set<String> pendingDirectoryOwners;

    public MappingFormat read(byte[] bytes) throws IOException {
        if (bytes.length == 0) {
            throw new IOException("Javadoc mapping file is empty");
        }

        String text = new String(bytes, StandardCharsets.UTF_8);
        MappingFormat format = MappingReader.detectFormat(new StringReader(text));
        if (format == null) {
            throw new IOException("Unsupported Javadoc mapping format");
        }

        MemoryMappingTree nextTree = new MemoryMappingTree();
        MappingVisitor visitor = withoutMethodVariables(nextTree);
        switch (format) {
            case TINY_2_FILE -> Tiny2FileReader.read(new StringReader(text), visitor);
            case ENIGMA_FILE -> EnigmaFileReader.read(new StringReader(text), visitor);
            default -> throw new IOException("Unsupported Javadoc mapping format: " + format);
        }

        if (format == MappingFormat.TINY_2_FILE && !OFFICIAL_NAMESPACE.equals(nextTree.getSrcNamespace())) {
            throw new IOException("Tiny v2 Javadoc mappings must use the official source namespace");
        }

        tree = nextTree;
        return format;
    }

    public String[] readDirectory(byte[][] files, String[] paths) throws IOException {
        if (files.length != paths.length) {
            throw new IllegalArgumentException("File and path counts differ");
        }

        String[] owners = new String[files.length];
        beginDirectory();

        try {
            for (int i = 0; i < files.length; i++) {
                owners[i] = readDirectoryFile(files[i], paths[i]);
            }

            finishDirectory();
        } catch (IOException | RuntimeException e) {
            abortDirectory();
            throw e;
        }

        return owners;
    }

    public void beginDirectory() {
        pendingDirectoryTree = newEnigmaTree();
        pendingDirectoryOwners = new HashSet<>();
    }

    public String readDirectoryFile(byte[] file, String path) throws IOException {
        if (pendingDirectoryTree == null || pendingDirectoryOwners == null) {
            throw new IllegalStateException("No Enigma directory import is active");
        }

        MemoryMappingTree fileTree = new MemoryMappingTree();

        try {
            EnigmaFileReader.read(new StringReader(new String(file, StandardCharsets.UTF_8)), withoutMethodVariables(fileTree));
        } catch (IOException | RuntimeException e) {
            throw new IOException("Invalid Enigma mapping file " + path + ": " + e.getMessage(), e);
        }

        String owner = null;

        for (MappingTree.ClassMapping clazz : fileTree.getClasses()) {
            String classOwner = outerClassName(clazz.getSrcName());

            if (owner == null) {
                owner = classOwner;
            } else if (!owner.equals(classOwner)) {
                throw new IOException("Enigma mapping file " + path + " contains multiple outer classes");
            }
        }

        if (owner == null) {
            throw new IOException("Enigma mapping file " + path + " is empty");
        }
        if (!pendingDirectoryOwners.add(owner)) {
            throw new IOException("Duplicate Enigma mapping for " + owner);
        }

        for (MappingTree.ClassMapping clazz : fileTree.getClasses()) {
            pendingDirectoryTree.addClass(clazz);
        }

        return owner;
    }

    public void finishDirectory() {
        if (pendingDirectoryTree == null) {
            throw new IllegalStateException("No Enigma directory import is active");
        }

        tree = pendingDirectoryTree;
        abortDirectory();
    }

    public void abortDirectory() {
        pendingDirectoryTree = null;
        pendingDirectoryOwners = null;
    }

    public void reset() {
        tree = newTree();
        abortDirectory();
    }

    public String get(ElementKind kind, String owner, String name, String descriptor) {
        MappingTree.ClassMapping clazz = tree.getClass(owner);
        if (clazz == null) {
            return null;
        }

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
        };
    }

    public void set(ElementKind kind, String owner, String name, String descriptor, String comment) throws IOException {
        if (comment != null && comment.isEmpty()) {
            comment = null;
        }

        MappingTree.ClassMapping clazz = tree.getClass(owner);
        if (comment == null) {
            if (clazz == null) {
                return;
            }

            switch (kind) {
                case CLASS -> clazz.setComment(null);
                case FIELD -> {
                    MappingTree.FieldMapping field = clazz.getField(name, descriptor);
                    if (field != null) {
                        field.setComment(null);
                    }
                }
                case METHOD -> {
                    MappingTree.MethodMapping method = clazz.getMethod(name, descriptor);
                    if (method != null) {
                        method.setComment(null);
                    }
                }
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
            }
        } finally {
            tree.visitEnd();
        }
    }

    public byte[] write(MappingFormat format) throws IOException {
        return write(format, tree);
    }

    public byte[] writeClass(String owner) throws IOException {
        String outerOwner = outerClassName(owner);
        MemoryMappingTree classTree = newEnigmaTree();

        for (MappingTree.ClassMapping clazz : tree.getClasses()) {
            if (outerOwner.equals(outerClassName(clazz.getSrcName())) && isMeaningful(clazz)) {
                classTree.addClass(clazz);
            }
        }

        if (classTree.getClasses().isEmpty()) {
            return new byte[0];
        }

        return write(MappingFormat.ENIGMA_FILE, classTree);
    }

    private static byte[] write(MappingFormat format, MemoryMappingTree source) throws IOException {
        StringWriter output = new StringWriter();
        MappingVisitor writer = switch (format) {
            case TINY_2_FILE -> new Tiny2FileWriter(output, false);
            case ENIGMA_FILE -> new EnigmaFileWriter(output);
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

    private static MappingVisitor withoutMethodVariables(MappingVisitor next) {
        return new ForwardingMappingVisitor(next) {
            @Override
            public boolean visitMethodArg(int argPosition, int lvIndex, String srcName) {
                return false;
            }

            @Override
            public boolean visitMethodVar(int lvtRowIndex, int lvIndex, int startOpIdx, int endOpIdx, String srcName) {
                return false;
            }
        };
    }

    private static MemoryMappingTree newEnigmaTree() {
        MemoryMappingTree result = new MemoryMappingTree();
        result.visitNamespaces(MappingUtil.NS_SOURCE_FALLBACK, List.of(MappingUtil.NS_TARGET_FALLBACK));
        result.visitEnd();
        return result;
    }

    private void pruneEmptyEntries(MappingTree.ClassMapping clazz, ElementKind kind, String name, String descriptor) {
        if (kind == ElementKind.FIELD) {
            MappingTree.FieldMapping field = clazz.getField(name, descriptor);
            if (field != null && !hasContent(field)) {
                clazz.removeField(name, descriptor);
            }
        } else if (kind == ElementKind.METHOD) {
            MappingTree.MethodMapping method = clazz.getMethod(name, descriptor);
            if (method != null && !hasContent(method)) {
                clazz.removeMethod(name, descriptor);
            }
        }

        if (!isMeaningful(clazz)) {
            tree.removeClass(clazz.getSrcName());
        }
    }

    private static boolean isMeaningful(MappingTree.ClassMapping clazz) {
        if (hasContent(clazz)) {
            return true;
        }
        if (clazz.getFields().stream().anyMatch(JavadocMappings::hasContent)) {
            return true;
        }
        return clazz.getMethods().stream().anyMatch(JavadocMappings::hasContent);
    }

    private static boolean hasContent(MappingTree.ElementMapping element) {
        if (element.getComment() != null) {
            return true;
        }

        for (int namespace = 0; namespace < element.getTree().getMaxNamespaceId(); namespace++) {
            if (element.getDstName(namespace) != null) {
                return true;
            }
        }

        return false;
    }

    private static String outerClassName(String name) {
        int start = 0;

        while (true) {
            int separator = name.indexOf('$', start);
            if (separator < 0) {
                return name;
            }
            if (separator > 0 && name.charAt(separator - 1) != '/') {
                return name.substring(0, separator);
            }
            start = separator + 1;
        }
    }
}
