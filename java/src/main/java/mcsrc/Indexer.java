package mcsrc;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.Opcodes;
import org.teavm.jso.JSExport;
import org.teavm.jso.typedarrays.ArrayBuffer;
import org.teavm.jso.typedarrays.Int8Array;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class Indexer {
    private static final Map<String, Set<String>> usages = new HashMap<>();
    private static int usageSize = 0;

    @JSExport
    public static void index(ArrayBuffer arrayBuffer) {
        byte[] bytes = new Int8Array(arrayBuffer).copyToJavaArray();
        ClassReader classReader = new ClassReader(bytes);
        classReader.accept(new ClassIndexVisitor(Opcodes.ASM9), 0);
    }

    @JSExport
    public static String[] getUsage(String key) {
        return usages.getOrDefault(key, Set.of()).toArray(String[]::new);
    }

    @JSExport
    public static int getUsageSize() {
        return usageSize;
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
}
