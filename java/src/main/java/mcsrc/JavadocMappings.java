package mcsrc;

import net.fabricmc.mappingio.MappedElementKind;
import net.fabricmc.mappingio.MappingReader;
import net.fabricmc.mappingio.MappingVisitor;
import net.fabricmc.mappingio.format.MappingFormat;
import net.fabricmc.mappingio.format.enigma.EnigmaFileReader;
import net.fabricmc.mappingio.format.enigma.EnigmaFileWriter;
import net.fabricmc.mappingio.format.tiny.Tiny2FileReader;
import net.fabricmc.mappingio.format.tiny.Tiny2FileWriter;
import net.fabricmc.mappingio.tree.MappingTreeView;
import net.fabricmc.mappingio.tree.MemoryMappingTree;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public final class JavadocMappings {
    private static final String OFFICIAL_NAMESPACE = "official";
    private static final int ENTRY_SIZE = 5;

    private JavadocMappings() {
    }

    public static String[] read(byte[] bytes) throws IOException {
        if (bytes.length == 0) throw new IOException("Javadoc mapping file is empty");

        String text = new String(bytes, StandardCharsets.UTF_8);
        MappingFormat mappingFormat = MappingReader.detectFormat(new StringReader(text));

        MemoryMappingTree tree = new MemoryMappingTree();
        switch (mappingFormat) {
            case TINY_2_FILE -> Tiny2FileReader.read(new StringReader(text), tree);
            case ENIGMA_FILE -> EnigmaFileReader.read(new StringReader(text), tree);
            default -> throw new UnsupportedOperationException("Unsupported Javadoc mapping format: " + mappingFormat);
        }

        if (!OFFICIAL_NAMESPACE.equals(tree.getSrcNamespace())) {
            throw new IOException("Tiny v2 Javadoc mappings must use the official source namespace");
        }

        List<String> result = new ArrayList<>();
        result.add("tiny2");
        for (MappingTreeView.ClassMappingView clazz : tree.getClasses()) {
            List<String> members = new ArrayList<>();
            addMembers(members, "f", clazz.getSrcName(), clazz.getFields());
            addMembers(members, "m", clazz.getSrcName(), clazz.getMethods());
            if (hasText(clazz.getComment()) || !members.isEmpty()) {
                addEntry(result, "c", clazz.getSrcName(), "", "", clazz.getComment());
                result.addAll(members);
            }
        }
        return result.toArray(String[]::new);
    }

    public static byte[] write(String format, String[] entries) throws IOException {
        if (entries.length % ENTRY_SIZE != 0) throw new IOException("Invalid Javadoc entries");

        StringWriter output = new StringWriter();
        MappingVisitor writer = switch (format) {
            case "tiny2" -> new Tiny2FileWriter(output, false);
            case "enigma" -> new EnigmaFileWriter(output);
            default -> throw new IOException("Unsupported Javadoc mapping format: " + format);
        };
        writer.visitNamespaces(OFFICIAL_NAMESPACE, List.of());

        for (int i = 0; i < entries.length; i += ENTRY_SIZE) {
            String kind = entries[i];
            MappedElementKind elementKind = switch (kind) {
                case "c" -> {
                    writer.visitClass(entries[i + 1]);
                    yield MappedElementKind.CLASS;
                }
                case "f" -> {
                    writer.visitField(entries[i + 2], entries[i + 3]);
                    yield MappedElementKind.FIELD;
                }
                case "m" -> {
                    writer.visitMethod(entries[i + 2], entries[i + 3]);
                    yield MappedElementKind.METHOD;
                }
                default -> throw new IOException("Invalid Javadoc entry kind: " + kind);
            };
            writer.visitElementContent(elementKind);
            if (hasText(entries[i + 4])) writer.visitComment(elementKind, entries[i + 4]);
        }

        writer.visitEnd();
        return output.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void addMembers(
            List<String> result,
            String kind,
            String owner,
            Iterable<? extends MappingTreeView.MemberMappingView> members
    ) {
        for (MappingTreeView.MemberMappingView member : members) {
            if (hasText(member.getComment())) {
                addEntry(result, kind, owner, member.getSrcName(), member.getSrcDesc(), member.getComment());
            }
        }
    }

    private static void addEntry(
            List<String> result,
            String kind,
            String owner,
            String name,
            String descriptor,
            String comment
    ) {
        result.add(kind);
        result.add(owner);
        result.add(name);
        result.add(descriptor);
        result.add(comment == null ? "" : comment);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isEmpty();
    }
}
