package mcsrc;

import net.fabricmc.mappingio.MappingUtil;
import net.fabricmc.mappingio.extras.MappingTreeRemapper;
import net.fabricmc.mappingio.format.proguard.ProGuardFileReader;
import net.fabricmc.mappingio.tree.MemoryMappingTree;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.commons.ClassRemapper;
import org.objectweb.asm.util.Textifier;
import org.objectweb.asm.util.TraceClassVisitor;
import org.teavm.jso.JSExport;
import org.teavm.jso.core.JSMap;
import org.teavm.jso.core.JSString;
import org.teavm.jso.typedarrays.ArrayBuffer;
import org.teavm.jso.typedarrays.Int8Array;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class Indexer {
    private static final Map<String, Set<String>> references = new HashMap<>();
    private static int referenceSize = 0;
    
    private static final Map<String, ClassInheritanceInfo> inheritanceData = new HashMap<>();
    private static final Map<String, ClassMemberInfo> memberData = new HashMap<>();
    private static MemoryMappingTree mappingTree;
    private static MappingTreeRemapper mappingTreeRemapper;

    @JSExport
    public static void index(ArrayBuffer arrayBuffer) {
        byte[] bytes = new Int8Array(arrayBuffer).copyToJavaArray();
        ClassReader classReader = new ClassReader(bytes);
        // Use SKIP_FRAMES for faster parsing - we don't need stack map frames for indexing
        classReader.accept(new ClassIndexVisitor(Opcodes.ASM9), ClassReader.SKIP_FRAMES);
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

        mappingTreeRemapper = new MappingTreeRemapper(mappingTree, MappingUtil.NS_TARGET_FALLBACK, MappingUtil.NS_SOURCE_FALLBACK);
    }

    @JSExport
    public static void clearRemapperState() {
        mappingTree = null;
        mappingTreeRemapper = null;
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

        reader.accept(new ClassRemapper(new LocalRenameVisitor(Opcodes.ASM9, writer), mappingTreeRemapper), ClassReader.SKIP_FRAMES);

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
        private final List<String> methods;
        private final List<String> fields;

        public ClassMemberInfo(String className) {
            this.className = className;
            this.methods = new ArrayList<>();
            this.fields = new ArrayList<>();
        }

        public void addMethod(Entry.Method method) {
            methods.add(method.str());
        }

        public void addField(Entry.Field field) {
            fields.add(field.str());
        }
    }
}
