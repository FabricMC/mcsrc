package mcsrc;

import org.teavm.jso.JSExport;
import org.teavm.jso.core.JSMap;
import org.teavm.jso.core.JSString;
import org.teavm.jso.typedarrays.ArrayBuffer;
import org.teavm.jso.typedarrays.Int8Array;

import java.util.Arrays;

public final class WasmInterface {
    private WasmInterface() {
    }

    @JSExport
    public static void index(ArrayBuffer arrayBuffer) {
        Indexer.index(new Int8Array(arrayBuffer).copyToJavaArray());
    }

    @JSExport
    public static void indexRemapData(ArrayBuffer arrayBuffer) {
        Indexer.indexRemapData(new Int8Array(arrayBuffer).copyToJavaArray());
    }

    @JSExport
    public static String[] getReference(String key) {
        return Indexer.getReference(key);
    }

    @JSExport
    public static int getReferenceSize() {
        return Indexer.getReferenceSize();
    }

    @JSExport
    public static String getBytecode(ArrayBuffer[] classBuffers) {
        byte[][] classBytes = Arrays.stream(classBuffers)
                .map(buffer -> new Int8Array(buffer).copyToJavaArray())
                .toArray(byte[][]::new);
        return Indexer.getBytecode(classBytes);
    }

    @JSExport
    public static String[] getMemberData() {
        return Indexer.getMemberData();
    }

    @JSExport
    public static String[] getClassData() {
        return Indexer.getClassData();
    }

    @JSExport
    public static void loadMappings(ArrayBuffer mappings) {
        Indexer.clearRemapperState();
        Indexer.loadMappings(new Int8Array(mappings).copyToJavaArray());
    }

    @JSExport
    public static void clearIndex() {
        Indexer.clearIndex();
    }

    @JSExport
    public static void loadRemapIndex(String[] classData, String[] memberData) {
        Indexer.loadRemapIndex(classData, memberData);
    }

    @JSExport
    public static void clearRemapperState() {
        Indexer.clearRemapperState();
    }

    @JSExport
    public static JSMap<JSString, JSString> getObfToDeobf() {
        var map = new JSMap<JSString, JSString>();

        for (var entry : Indexer.getObfToDeobf().entrySet()) {
            map.set(JSString.valueOf(entry.getKey()), JSString.valueOf(entry.getValue()));
        }

        return map;
    }

    @JSExport
    public static Int8Array remapEntry(ArrayBuffer entry) {
        byte[] remappedBytes = Indexer.remapEntry(new Int8Array(entry).copyToJavaArray());
        var array = new Int8Array(remappedBytes.length);
        array.set(remappedBytes);
        return array;
    }
}
