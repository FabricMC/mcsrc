package mcsrc;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import mcsrc.javadoc.DeclarationMetadata;

import net.fabricmc.mappingio.format.MappingFormat;

import org.teavm.jso.JSExport;
import org.teavm.jso.JSBody;
import org.teavm.jso.JSObject;
import org.teavm.jso.core.JSMap;
import org.teavm.jso.core.JSString;
import org.teavm.jso.typedarrays.ArrayBuffer;
import org.teavm.jso.typedarrays.Int8Array;

public final class WasmInterface {
    private static final Indexer INDEXER = new Indexer();
    private static final JavadocMappings JAVADOC_MAPPINGS = new JavadocMappings();
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
        return INDEXER.referenceArray(key);
    }

    @JSExport
    public static int getReferenceSize() {
        INDEXER.finish();
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
        return INDEXER.memberData()
                .map(WasmInterface::serialize)
                .toArray(String[]::new);
    }

    @JSExport
    public static String[] getClassData() {
        return INDEXER.classData()
                .map(WasmInterface::serialize)
                .toArray(String[]::new);
    }

    @JSExport
    public static JSObject getDeclarationMetadata(ArrayBuffer classBytes, String methodName, String descriptor) {
        DeclarationMetadata metadata = DeclarationMetadata.read(toBytes(classBytes), methodName, descriptor);
        return declarationMetadata(
                metadata.typeParameters().toArray(String[]::new),
                metadata.exceptions().toArray(String[]::new),
                metadata.recordComponents().toArray(String[]::new));
    }

    @JSBody(params = { "typeParameters", "exceptions", "recordComponents" },
            script = "return { typeParameters: typeParameters, exceptions: exceptions, recordComponents: recordComponents };")
    private static native JSObject declarationMetadata(String[] typeParameters, String[] exceptions, String[] recordComponents);

    @JSExport
    public static void loadMappings(ArrayBuffer mappings) {
        remapper = new ClassFileRemapper(toBytes(mappings));
    }

    @JSExport
    public static void clearIndex() {
        INDEXER.clear();
    }

    @JSExport
    public static void clearDeclarations() {
        INDEXER.clearDeclarations();
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
        return toInt8Array(remappedBytes);
    }

    @JSExport
    public static String readJavadocs(ArrayBuffer mappings) throws IOException {
        return switch (JAVADOC_MAPPINGS.read(toBytes(mappings))) {
            case TINY_2_FILE -> "tiny2";
            case ENIGMA_FILE -> "enigma";
            default -> throw new IllegalStateException("Unsupported Javadoc mapping format");
        };
    }

    @JSExport
    public static void beginJavadocDirectory() {
        JAVADOC_MAPPINGS.beginDirectory();
    }

    @JSExport
    public static String readJavadocDirectoryFile(ArrayBuffer mappings, String path) throws IOException {
        return JAVADOC_MAPPINGS.readDirectoryFile(toBytes(mappings), path);
    }

    @JSExport
    public static void finishJavadocDirectory() {
        JAVADOC_MAPPINGS.finishDirectory();
    }

    @JSExport
    public static void abortJavadocDirectory() {
        JAVADOC_MAPPINGS.abortDirectory();
    }

    @JSExport
    public static Int8Array writeJavadocs(String format) throws IOException {
        return toInt8Array(JAVADOC_MAPPINGS.write(javadocFormat(format)));
    }

    @JSExport
    public static Int8Array writeJavadocClass(String owner) throws IOException {
        return toInt8Array(JAVADOC_MAPPINGS.writeClass(owner));
    }

    @JSExport
    public static Int8Array createJavadocs(String format) throws IOException {
        return toInt8Array(new JavadocMappings().write(javadocFormat(format)));
    }

    @JSExport
    public static void resetJavadocs() {
        JAVADOC_MAPPINGS.reset();
    }

    @JSExport
    public static String getJavadoc(int kind, String owner, String name, String descriptor) {
        return JAVADOC_MAPPINGS.get(javadocElementKind(kind), owner, name, descriptor);
    }

    @JSExport
    public static void setJavadoc(int kind, String owner, String name, String descriptor, String comment) throws IOException {
        JAVADOC_MAPPINGS.set(javadocElementKind(kind), owner, name, descriptor, comment);
    }

    private static MappingFormat javadocFormat(String format) throws IOException {
        return switch (format) {
            case "tiny2" -> MappingFormat.TINY_2_FILE;
            case "enigma" -> MappingFormat.ENIGMA_FILE;
            default -> throw new IOException("Unsupported Javadoc mapping format: " + format);
        };
    }

    private static JavadocMappings.ElementKind javadocElementKind(int kind) {
        return switch (kind) {
            case 0 -> JavadocMappings.ElementKind.CLASS;
            case 1 -> JavadocMappings.ElementKind.FIELD;
            case 2 -> JavadocMappings.ElementKind.METHOD;
            default -> throw new IllegalArgumentException("Unsupported Javadoc element kind: " + kind);
        };
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

    private static Int8Array toInt8Array(byte[] bytes) {
        var result = new Int8Array(bytes.length);
        result.set(bytes);
        return result;
    }

    private static String serialize(ClassData data) {
        String superName = data.superName() == null ? "" : data.superName();
        return data.name() + "|" + superName + "|" + data.access() + "|" + String.join(",", data.interfaces());
    }

    private static String serialize(MemberData data) {
        // Sections: className|methods|fields|methodAccess|methodBridges; entries are comma-separated.
        StringBuilder result = new StringBuilder(data.className()).append('|');

        // Methods: owner:name:descriptor, e.g. Example:get:()I
        String separator = "";
        for (Entry.Method method : data.methods()) {
            result.append(separator);
            appendMethod(result, method);
            separator = ",";
        }

        // Fields: owner:name:descriptor, e.g. Example:value:I
        result.append('|');
        separator = "";
        for (Entry.Field field : data.fields()) {
            result.append(separator)
                    .append(field.owner()).append(':')
                    .append(field.name()).append(':')
                    .append(field.desc());
            separator = ",";
        }

        // Method access flags: owner:name:descriptor:access, e.g. Example:get:()I:1 (public)
        result.append('|');
        separator = "";
        for (Map.Entry<Entry.Method, Integer> entry : data.methodAccess().entrySet()) {
            result.append(separator);
            appendMethod(result, entry.getKey());
            result.append(':').append(entry.getValue());
            separator = ",";
        }

        // Bridge to implementation: e.g. Example:get:()Ljava/lang/Object;=Example:get:()Ljava/lang/String;
        result.append('|');
        separator = "";
        for (Map.Entry<Entry.Method, Entry.Method> entry : data.methodBridges().entrySet()) {
            result.append(separator);
            appendMethod(result, entry.getKey());
            result.append('=');
            appendMethod(result, entry.getValue());
            separator = ",";
        }

        return result.toString();
    }

    private static void appendMethod(StringBuilder result, Entry.Method method) {
        result.append(method.owner()).append(':').append(method.name()).append(':').append(method.desc());
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
