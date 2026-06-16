package mcsrc;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.util.Textifier;
import org.objectweb.asm.util.TraceClassVisitor;
import org.teavm.jso.JSExport;
import org.teavm.jso.JSObject;
import org.teavm.jso.JSProperty;
import org.teavm.jso.typedarrays.ArrayBuffer;
import org.teavm.jso.typedarrays.Int8Array;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.*;

public class Indexer {
    private static final Map<String, Set<String>> references = new HashMap<>();
    private static int referenceSize = 0;
    
    private static final Map<String, ClassInheritanceInfo> inheritanceData = new HashMap<>();
    private static final Map<String, ClassMemberInfo> memberData = new HashMap<>();

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
    
    private static class ClassInheritanceInfo {
        String className;
        String superName;
        String[] interfaces;
        int accessFlags;
    }

    public static final class ClassMemberInfo implements JSObject {
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

        public String getClassName() {
            return className;
        }

        public String[] getMethods() {
            return methods.toArray(new String[0]);
        }

        public String[] getFields() {
            return fields.toArray(new String[0]);
        }
    }
}
