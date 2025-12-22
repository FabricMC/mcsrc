package mcsrc;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.Opcodes;
import org.teavm.jso.JSExport;
import org.teavm.jso.typedarrays.ArrayBuffer;
import org.teavm.jso.typedarrays.Int8Array;

public class Indexer {
    @JSExport
    public static void index(ArrayBuffer arrayBuffer, Context context) {
        byte[] bytes = new Int8Array(arrayBuffer).copyToJavaArray();
        ClassReader classReader = new ClassReader(bytes);
        classReader.accept(new ClassIndexVisitor(Opcodes.ASM9, context), 0);
    }
}
