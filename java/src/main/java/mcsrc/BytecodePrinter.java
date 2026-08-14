package mcsrc;

import java.io.PrintWriter;
import java.io.StringWriter;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.util.Textifier;
import org.objectweb.asm.util.TraceClassVisitor;

public final class BytecodePrinter {
    private BytecodePrinter() {
    }

    public static String print(byte[]... classes) {
        StringBuilder result = new StringBuilder();

        for (byte[] classBytes : classes) {
            StringWriter output = new StringWriter();
            PrintWriter writer = new PrintWriter(output);
            new ClassReader(classBytes).accept(
                    new TraceClassVisitor(null, new Textifier(), writer), 0);
            result.append(output).append('\n');
        }

        return result.toString();
    }
}
