package mcsrc;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.util.Textifier;
import org.objectweb.asm.util.TraceClassVisitor;
import org.teavm.jso.JSExport;
import org.teavm.jso.typedarrays.ArrayBuffer;
import org.teavm.jso.typedarrays.Int8Array;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.*;

public class Indexer {
    private static final Map<String, Set<String>> usages = new HashMap<>();
    private static int usageSize = 0;
    
    private static final Map<String, ClassInheritanceInfo> inheritanceData = new HashMap<>();

    @JSExport
    public static void index(ArrayBuffer arrayBuffer) {
        byte[] bytes = new Int8Array(arrayBuffer).copyToJavaArray();
        ClassReader classReader = new ClassReader(bytes);
        // Use SKIP_FRAMES for faster parsing - we don't need stack map frames for indexing
        classReader.accept(new ClassIndexVisitor(Opcodes.ASM9), ClassReader.SKIP_FRAMES);
    }

    @JSExport
    public static String[] getUsage(String key) {
        return usages.getOrDefault(key, Set.of()).toArray(String[]::new);
    }

    @JSExport
    public static int getUsageSize() {
        return usageSize;
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

    public static void addUsage(String key, String value) {
        if (!isMinecraft(key)) {
            return;
        }

        usages.computeIfAbsent(key, k -> new HashSet<>()).add(value);
        usageSize++;
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
}
