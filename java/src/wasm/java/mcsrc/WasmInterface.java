package mcsrc;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.teavm.jso.JSExport;
import org.teavm.jso.core.JSMap;
import org.teavm.jso.core.JSString;
import org.teavm.jso.typedarrays.ArrayBuffer;
import org.teavm.jso.typedarrays.Int8Array;

public final class WasmInterface {
    private static final Indexer INDEXER = new Indexer();
    private static ClassFileRemapper remapper;

    private WasmInterface() {
    }

    @JSExport
    public static void index(ArrayBuffer arrayBuffer) {
        INDEXER.index(toBytes(arrayBuffer));
    }

    @JSExport
    public static void indexRemapData(ArrayBuffer arrayBuffer) {
        INDEXER.indexDeclarations(toBytes(arrayBuffer));
    }

    @JSExport
    public static String[] getReference(String key) {
        return INDEXER.references(key).toArray(String[]::new);
    }

    @JSExport
    public static int getReferenceSize() {
        return INDEXER.referenceCount();
    }

    @JSExport
    public static String getBytecode(ArrayBuffer[] classBuffers) {
        byte[][] classes = Arrays.stream(classBuffers)
                .map(WasmInterface::toBytes)
                .toArray(byte[][]::new);
        return BytecodePrinter.print(classes);
    }

    @JSExport
    public static String[] getMemberData() {
        return INDEXER.data().members().values().stream()
                .map(WasmInterface::serialize)
                .toArray(String[]::new);
    }

    @JSExport
    public static String[] getClassData() {
        return INDEXER.data().classes().values().stream()
                .map(WasmInterface::serialize)
                .toArray(String[]::new);
    }

    @JSExport
    public static void loadMappings(ArrayBuffer mappings) {
        remapper = new ClassFileRemapper(toBytes(mappings));
    }

    @JSExport
    public static void clearIndex() {
        INDEXER.clear();
    }

    @JSExport
    public static void loadRemapIndex(String[] classData, String[] memberData) {
        if (remapper == null) {
            throw new IllegalStateException("Mappings must be loaded before the remap index");
        }

        remapper.setIndex(deserialize(classData, memberData));
    }

    @JSExport
    public static void clearRemapperState() {
        remapper = null;
    }

    @JSExport
    public static JSMap<JSString, JSString> getObfToDeobf() {
        var result = new JSMap<JSString, JSString>();

        for (Map.Entry<String, String> entry : requireRemapper().classMappings().entrySet()) {
            result.set(JSString.valueOf(entry.getKey()), JSString.valueOf(entry.getValue()));
        }

        return result;
    }

    @JSExport
    public static Int8Array remapEntry(ArrayBuffer entry) {
        byte[] remappedBytes = requireRemapper().remap(toBytes(entry));
        var result = new Int8Array(remappedBytes.length);
        result.set(remappedBytes);
        return result;
    }

    private static ClassFileRemapper requireRemapper() {
        if (remapper == null) {
            throw new IllegalStateException("Mappings have not been loaded");
        }

        return remapper;
    }

    private static byte[] toBytes(ArrayBuffer buffer) {
        return new Int8Array(buffer).copyToJavaArray();
    }

    private static String serialize(ClassData data) {
        return "%s|%s|%d|%s".formatted(
                data.name(),
                data.superName() == null ? "" : data.superName(),
                data.access(),
                String.join(",", data.interfaces()));
    }

    private static String serialize(MemberData data) {
        String methods = String.join(",", data.methods().stream().map(Entry.Method::str).toList());
        String fields = String.join(",", data.fields().stream().map(Entry.Field::str).toList());
        return "%s|%s|%s".formatted(data.className(), methods, fields);
    }

    private static IndexData deserialize(String[] classes, String[] members) {
        Map<String, ClassData> classData = new HashMap<>();
        Map<String, MemberData> memberData = new HashMap<>();

        for (String value : classes) {
            String[] parts = value.split("\\|", -1);
            classData.put(parts[0], new ClassData(
                    parts[0],
                    parts[1].isEmpty() ? null : parts[1],
                    parts[3].isEmpty() ? List.of() : Arrays.asList(parts[3].split(",")),
                    Integer.parseInt(parts[2])));
        }

        for (String value : members) {
            String[] parts = value.split("\\|", -1);
            Set<Entry.Method> methods = new HashSet<>();
            Set<Entry.Field> fields = new HashSet<>();

            if (!parts[1].isEmpty()) {
                Arrays.stream(parts[1].split(","))
                        .map(WasmInterface::parseMethod)
                        .forEach(methods::add);
            }

            if (!parts[2].isEmpty()) {
                Arrays.stream(parts[2].split(","))
                        .map(WasmInterface::parseField)
                        .forEach(fields::add);
            }

            memberData.put(parts[0], new MemberData(parts[0], methods, fields));
        }

        return new IndexData(classData, memberData);
    }

    private static Entry.Method parseMethod(String value) {
        String[] parts = value.split(":", 3);
        return new Entry.Method(parts[0], parts[1], parts[2]);
    }

    private static Entry.Field parseField(String value) {
        String[] parts = value.split(":", 3);
        return new Entry.Field(parts[0], parts[1], parts[2]);
    }
}
