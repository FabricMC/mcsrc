package mcsrc;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import net.fabricmc.mappingio.MappingUtil;
import net.fabricmc.mappingio.extras.MappingTreeRemapper;
import net.fabricmc.mappingio.format.proguard.ProGuardFileReader;
import net.fabricmc.mappingio.tree.MappingTree;
import net.fabricmc.mappingio.tree.MemoryMappingTree;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.commons.ClassRemapper;
import org.objectweb.asm.commons.Remapper;

public final class ClassFileRemapper {
    private final MemoryMappingTree mappings;
    private Remapper remapper;

    public ClassFileRemapper(byte[] mappings) {
        this.mappings = readMappings(mappings);
        setIndex(IndexData.empty());
    }

    public ClassFileRemapper(byte[] mappings, IndexData index) {
        this.mappings = readMappings(mappings);
        setIndex(index);
    }

    public void setIndex(IndexData index) {
        remapper = new InheritanceAwareRemapper(mappings, Objects.requireNonNull(index, "index"));
    }

    public Map<String, String> classMappings() {
        int obfuscatedNamespace = mappings.getNamespaceId(MappingUtil.NS_TARGET_FALLBACK);
        int deobfuscatedNamespace = mappings.getNamespaceId(MappingUtil.NS_SOURCE_FALLBACK);
        Map<String, String> result = new HashMap<>();

        for (MappingTree.ClassMapping mapping : mappings.getClasses()) {
            result.put(mapping.getName(obfuscatedNamespace), mapping.getName(deobfuscatedNamespace));
        }

        return Map.copyOf(result);
    }

    public byte[] remap(byte[] classBytes) {
        ClassReader reader = new ClassReader(classBytes);
        ClassWriter writer = new ClassWriter(0) {
            @Override
            protected String getCommonSuperClass(String type1, String type2) {
                return "java/lang/Object";
            }
        };

        reader.accept(
                new ClassRemapper(new LocalRenameVisitor(Opcodes.ASM9, writer), remapper),
                ClassReader.SKIP_FRAMES);
        return writer.toByteArray();
    }

    private static MemoryMappingTree readMappings(byte[] mappings) {
        var reader = new InputStreamReader(new ByteArrayInputStream(mappings), StandardCharsets.UTF_8);
        var tree = new MemoryMappingTree();

        try {
            ProGuardFileReader.read(reader, tree);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }

        tree.setIndexByDstNames(true);
        return tree;
    }

    private static final class InheritanceAwareRemapper extends Remapper {
        private final MemoryMappingTree mappings;
        private final MappingTreeRemapper delegate;
        private final IndexData index;
        private final int fromNamespace;
        private final int toNamespace;

        private InheritanceAwareRemapper(MemoryMappingTree mappings, IndexData index) {
            super(Opcodes.ASM9);
            this.mappings = mappings;
            this.delegate = new MappingTreeRemapper(
                    mappings, MappingUtil.NS_TARGET_FALLBACK, MappingUtil.NS_SOURCE_FALLBACK);
            this.index = index;
            this.fromNamespace = mappings.getNamespaceId(MappingUtil.NS_TARGET_FALLBACK);
            this.toNamespace = mappings.getNamespaceId(MappingUtil.NS_SOURCE_FALLBACK);
        }

        @Override
        public String map(String internalName) {
            return delegate.map(internalName);
        }

        @Override
        public String mapMethodName(String owner, String name, String descriptor) {
            MappingTree.MethodMapping mapping = mappings.getMethod(owner, name, descriptor, fromNamespace);

            if (mapping != null) {
                return mapping.getName(toNamespace);
            }

            if (hasMember(owner, name, descriptor, true)) {
                return name;
            }

            String inheritedOwner = findInheritedMemberOwner(owner, name, descriptor, true);
            return inheritedOwner == null ? name : delegate.mapMethodName(inheritedOwner, name, descriptor);
        }

        @Override
        public String mapFieldName(String owner, String name, String descriptor) {
            MappingTree.FieldMapping mapping = mappings.getField(owner, name, descriptor, fromNamespace);

            if (mapping != null) {
                return mapping.getName(toNamespace);
            }

            if (hasMember(owner, name, descriptor, false)) {
                return name;
            }

            String inheritedOwner = findInheritedMemberOwner(owner, name, descriptor, false);
            return inheritedOwner == null ? name : delegate.mapFieldName(inheritedOwner, name, descriptor);
        }

        @Override
        public String mapRecordComponentName(String owner, String name, String descriptor) {
            return delegate.mapRecordComponentName(owner, name, descriptor);
        }

        private String findInheritedMemberOwner(String owner, String name, String descriptor, boolean method) {
            ArrayDeque<String> queue = new ArrayDeque<>();
            Set<String> visited = new HashSet<>();
            addParents(owner, queue);

            while (!queue.isEmpty()) {
                String parent = queue.removeFirst();

                if (!visited.add(parent)) {
                    continue;
                }

                if (hasMember(parent, name, descriptor, method)) {
                    return parent;
                }

                addParents(parent, queue);
            }

            return null;
        }

        private boolean hasMember(String owner, String name, String descriptor, boolean method) {
            MemberData memberData = index.members().get(owner);

            if (memberData == null) {
                return false;
            }

            return method
                    ? memberData.methods().contains(new Entry.Method(owner, name, descriptor))
                    : memberData.fields().contains(new Entry.Field(owner, name, descriptor));
        }

        private void addParents(String owner, ArrayDeque<String> queue) {
            ClassData classData = index.classes().get(owner);

            if (classData == null) {
                return;
            }

            if (classData.superName() != null) {
                queue.add(classData.superName());
            }

            queue.addAll(classData.interfaces());
        }
    }
}
