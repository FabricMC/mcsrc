package mcsrc;

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
import org.objectweb.asm.util.Textifier;
import org.objectweb.asm.util.TraceClassVisitor;
import org.teavm.jso.JSExport;
import org.teavm.jso.core.JSMap;
import org.teavm.jso.core.JSString;
import org.teavm.jso.typedarrays.ArrayBuffer;
import org.teavm.jso.typedarrays.Int8Array;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class Indexer {
    private static final Map<String, Set<String>> references = new HashMap<>();
    private static int referenceSize = 0;
    private static final int ASM_VERSION = Opcodes.ASM9;
    
    private static final Map<String, ClassInheritanceInfo> inheritanceData = new HashMap<>();
    private static final Map<String, ClassMemberInfo> memberData = new HashMap<>();
    private static MemoryMappingTree mappingTree;
    private static Remapper mappingTreeRemapper;

    @JSExport
    public static void index(ArrayBuffer arrayBuffer) {
        byte[] bytes = new Int8Array(arrayBuffer).copyToJavaArray();
        ClassReader classReader = new ClassReader(bytes);
        // Use SKIP_FRAMES for faster parsing - we don't need stack map frames for indexing
        classReader.accept(new ClassIndexVisitor(ASM_VERSION), ClassReader.SKIP_FRAMES);
    }

    @JSExport
    public static String[] getReference(String key) {
        return references.getOrDefault(key, Set.of()).toArray(String[]::new);
    }

    @JSExport
    public static int getReferenceSize() {
        return referenceSize;
    }

    @JSExport
    public static String getBytecode(ArrayBuffer[] classBuffers) {
        StringBuilder result = new StringBuilder();

        for (ArrayBuffer classBuffer : classBuffers) {
            byte[] bytes = new Int8Array(classBuffer).copyToJavaArray();
            ClassReader classReader = new ClassReader(bytes);
            Textifier textifier = new Textifier();

            StringWriter out = new StringWriter();
            PrintWriter writer = new PrintWriter(out);
            TraceClassVisitor traceClassVisitor = new TraceClassVisitor(null, textifier, writer);
            classReader.accept(traceClassVisitor, 0);

            result.append(out).append("\n");
        }

        return result.toString();
    }

    public static void addReference(String key, String value) {
        if (!isMinecraft(key)) {
            return;
        }

        references.computeIfAbsent(key, k -> new HashSet<>()).add(value);
        referenceSize++;
    }

    private static boolean isMinecraft(String str) {
        return str.startsWith("net/minecraft") || str.startsWith("com/mojang");
    }
    
    public static void addClassData(String className, String superName, String[] interfaces, int accessFlags) {
        ClassInheritanceInfo info = inheritanceData.computeIfAbsent(className, k -> new ClassInheritanceInfo());
        info.className = className;
        info.superName = superName;
        info.interfaces = interfaces != null ? interfaces : new String[0];
        info.accessFlags = accessFlags;
    }

    public static void addMemberData(String className, Entry.Method method) {
        ClassMemberInfo info = memberData.computeIfAbsent(className, k -> new ClassMemberInfo(className));
        info.addMethod(method);
    }

    public static void addMemberData(String className, Entry.Field field) {
        ClassMemberInfo info = memberData.computeIfAbsent(className, k -> new ClassMemberInfo(className));
        info.addField(field);
    }

    @JSExport
    public static String[] getMemberData() {
        List<String> result = new ArrayList<>();
        for (ClassMemberInfo info : memberData.values()) {
            StringBuilder sb = new StringBuilder();
            sb.append(info.className).append("|");
            sb.append(String.join(",", info.methods)).append("|");
            sb.append(String.join(",", info.fields));
            result.add(sb.toString());
        }
        return result.toArray(new String[0]);
    }
    
    @JSExport
    public static String[] getClassData() {
        List<String> result = new ArrayList<>();
        for (ClassInheritanceInfo info : inheritanceData.values()) {
            StringBuilder sb = new StringBuilder();
            sb.append(info.className).append("|");
            sb.append(info.superName != null ? info.superName : "").append("|");
            sb.append(info.accessFlags).append("|");
            sb.append(String.join(",", info.interfaces));
            result.add(sb.toString());
        }
        return result.toArray(new String[0]);
    }

    @JSExport
    public static void loadMappings(ArrayBuffer mappings) {
        clearRemapperState();

        var mappingsArray = new Int8Array(mappings).copyToJavaArray();
        var mappingsReader = new InputStreamReader(new ByteArrayInputStream(mappingsArray), StandardCharsets.UTF_8);

        try {
            var tree = new MemoryMappingTree();
            ProGuardFileReader.read(mappingsReader, tree);
            tree.setIndexByDstNames(true);
            mappingTree = tree;
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

        mappingTreeRemapper = new InheritanceAwareRemapper(mappingTree, MappingUtil.NS_TARGET_FALLBACK, MappingUtil.NS_SOURCE_FALLBACK);
    }

    @JSExport
    public static void clearIndex() {
        references.clear();
        referenceSize = 0;
        inheritanceData.clear();
        memberData.clear();
    }

    @JSExport
    public static void loadRemapIndex(String[] classData, String[] memberData) {
        inheritanceData.clear();
        Indexer.memberData.clear();

        for (String classInfo : classData) {
            String[] parts = classInfo.split("\\|", -1);
            ClassInheritanceInfo info = inheritanceData.computeIfAbsent(parts[0], k -> new ClassInheritanceInfo());
            info.className = parts[0];
            info.superName = parts[1].isEmpty() ? null : parts[1];
            info.accessFlags = Integer.parseInt(parts[2]);
            info.interfaces = parts[3].isEmpty() ? new String[0] : parts[3].split(",");
        }

        for (String memberInfo : memberData) {
            String[] parts = memberInfo.split("\\|", -1);
            ClassMemberInfo info = Indexer.memberData.computeIfAbsent(parts[0], ClassMemberInfo::new);

            if (!parts[1].isEmpty()) {
                Collections.addAll(info.methods, parts[1].split(","));
            }

            if (!parts[2].isEmpty()) {
                Collections.addAll(info.fields, parts[2].split(","));
            }
        }
    }

    @JSExport
    public static void clearRemapperState() {
        mappingTree = null;
        mappingTreeRemapper = null;
        inheritanceData.clear();
        memberData.clear();
    }

    @JSExport
    public static JSMap<JSString, JSString> getObfToDeobf() {
        int obfId = mappingTree.getNamespaceId(MappingUtil.NS_TARGET_FALLBACK);
        int deobfId = mappingTree.getNamespaceId(MappingUtil.NS_SOURCE_FALLBACK);
        var map = new JSMap<JSString, JSString>();

        for (var mapping : mappingTree.getClasses()) {
            String obfName = mapping.getName(obfId);
            String deobfName = mapping.getName(deobfId);
            map.set(JSString.valueOf(obfName), JSString.valueOf(deobfName));
        }

        return map;
    }

    @JSExport
    public static Int8Array remapEntry(ArrayBuffer entry) {
        var classBytes = new Int8Array(entry).copyToJavaArray();
        ClassReader reader = new ClassReader(classBytes);
        ClassWriter writer = new ClassWriter(0) {
            @Override
            protected String getCommonSuperClass(String type1, String type2) {
                return "java/lang/Object";
            }
        };

        reader.accept(new ClassRemapper(new LocalRenameVisitor(ASM_VERSION, writer), mappingTreeRemapper), ClassReader.SKIP_FRAMES);

        var remappedBytes = writer.toByteArray();
        var array = new Int8Array(remappedBytes.length);
        array.set(remappedBytes);
        return array;
    }

    private static class ClassInheritanceInfo {
        String className;
        String superName;
        String[] interfaces;
        int accessFlags;
    }

    public static final class ClassMemberInfo {
        private final String className;
        private final Set<String> methods;
        private final Set<String> fields;

        public ClassMemberInfo(String className) {
            this.className = className;
            this.methods = new HashSet<>();
            this.fields = new HashSet<>();
        }

        public void addMethod(Entry.Method method) {
            methods.add(method.str());
        }

        public void addField(Entry.Field field) {
            fields.add(field.str());
        }
    }

    private static final class InheritanceAwareRemapper extends Remapper {
        private final MemoryMappingTree mappingTree;
        private final MappingTreeRemapper delegate;
        private final int fromNamespace;
        private final int toNamespace;

        private InheritanceAwareRemapper(MemoryMappingTree mappingTree, String fromNamespace, String toNamespace) {
            super(ASM_VERSION);
            this.mappingTree = mappingTree;
            this.delegate = new MappingTreeRemapper(mappingTree, fromNamespace, toNamespace);
            this.fromNamespace = mappingTree.getNamespaceId(fromNamespace);
            this.toNamespace = mappingTree.getNamespaceId(toNamespace);
        }

        @Override
        public String map(String internalName) {
            return delegate.map(internalName);
        }

        @Override
        public String mapMethodName(String owner, String name, String descriptor) {
            String mappedName = mapMethodNameExact(owner, name, descriptor);

            if (mappedName != null) {
                return mappedName;
            }

            String inheritedOwner = findInheritedMemberOwner(owner, name, descriptor, true);
            return inheritedOwner == null ? name : delegate.mapMethodName(inheritedOwner, name, descriptor);
        }

        @Override
        public String mapFieldName(String owner, String name, String descriptor) {
            String mappedName = mapFieldNameExact(owner, name, descriptor);

            if (mappedName != null) {
                return mappedName;
            }

            String inheritedOwner = findInheritedMemberOwner(owner, name, descriptor, false);
            return inheritedOwner == null ? name : delegate.mapFieldName(inheritedOwner, name, descriptor);
        }

        @Override
        public String mapRecordComponentName(String owner, String name, String descriptor) {
            return delegate.mapRecordComponentName(owner, name, descriptor);
        }

        private String mapMethodNameExact(String owner, String name, String descriptor) {
            MappingTree.MethodMapping mapping = mappingTree.getMethod(owner, name, descriptor, fromNamespace);
            return mapping == null ? null : mapping.getName(toNamespace);
        }

        private String mapFieldNameExact(String owner, String name, String descriptor) {
            MappingTree.FieldMapping mapping = mappingTree.getField(owner, name, descriptor, fromNamespace);
            return mapping == null ? null : mapping.getName(toNamespace);
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

                ClassMemberInfo memberInfo = memberData.get(parent);

                if (memberInfo != null) {
                    String member = "%s:%s:%s".formatted(parent, name, descriptor);

                    if ((method ? memberInfo.methods : memberInfo.fields).contains(member)) {
                        return parent;
                    }
                }

                addParents(parent, queue);
            }

            return null;
        }

        private static void addParents(String owner, ArrayDeque<String> queue) {
            ClassInheritanceInfo info = inheritanceData.get(owner);

            if (info == null) {
                return;
            }

            if (info.superName != null) {
                queue.add(info.superName);
            }

            Collections.addAll(queue, info.interfaces);
        }
    }
}
