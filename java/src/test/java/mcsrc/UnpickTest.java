package mcsrc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.MethodNode;

class UnpickTest {
    @Test
    void appliesFlagsAndAnnotationsAcrossDefinitionFiles() throws IOException {
        var requested = new ArrayList<String>();
        var unpick = new Unpick(name -> {
            requested.add(name);
            try {
                return classBytes(Class.forName(name.replace('/', '.')));
            } catch (ClassNotFoundException exception) {
                return null;
            } catch (IOException exception) {
                throw new UncheckedIOException(exception);
            }
        });
        unpick.loadDefinitions(new String[] {
                """
                unpick v4
                group int flags
                    @flags
                    mcsrc.UnpickTest$Api.FIRST
                    mcsrc.UnpickTest$Api.SECOND
                """,
                """
                unpick v4
                target_annotation mcsrc.UnpickTest$Flags flags
                """
        });

        var result = new ClassNode();
        new ClassReader(unpick.apply(classBytes(Usage.class))).accept(result, 0);
        assertEquals(List.of("FIRST", "SECOND"), fields(method(result, "flags")));
        assertTrue(fields(method(result, "unrelated")).isEmpty());
        assertTrue(requested.contains("mcsrc/UnpickTest$Api"));
    }

    @Test
    void rejectsApplyingBeforeDefinitionsAndInvalidDefinitions() throws IOException {
        var unpick = new Unpick(name -> null);
        assertThrows(IllegalStateException.class, () -> unpick.apply(classBytes(Usage.class)));
        unpick.loadDefinitions(new String[] { "unpick v4\n" });
        assertThrows(RuntimeException.class, () -> new Unpick(name -> null).loadDefinitions(new String[] { "invalid\n" }));
    }

    private static MethodNode method(ClassNode node, String name) {
        return node.methods.stream().filter(method -> method.name.equals(name)).findFirst().orElseThrow();
    }

    private static List<String> fields(MethodNode method) {
        var fields = new ArrayList<String>();
        for (var instruction : method.instructions) {
            if (instruction instanceof FieldInsnNode field) {
                fields.add(field.name);
            }
        }
        return fields;
    }

    private static byte[] classBytes(Class<?> type) throws IOException {
        try (var stream = type.getResourceAsStream("/" + type.getName().replace('.', '/') + ".class")) {
            return stream.readAllBytes();
        }
    }

    @Retention(RetentionPolicy.CLASS)
    @interface Flags {
    }

    static class Api {
        static final int FIRST = 1;
        static final int SECOND = 2;

        static void accept(@Flags int flags) {
        }
    }

    static class Usage {
        static void flags() {
            Api.accept(3);
        }

        static int unrelated() {
            return 3;
        }
    }
}
