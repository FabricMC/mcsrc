package mcsrc;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;

import org.junit.jupiter.api.Test;

class JavadocMappingsTest {
    @Test
    void readsDirectoryFilesAndNestedClasses() throws IOException {
        String first = """
                CLASS a/A
                	COMMENT Class docs
                	FIELD value I
                		COMMENT Field docs
                	METHOD run ()V
                		COMMENT Method docs
                	CLASS Inner
                		COMMENT Inner docs
                """;
        String second = """
                CLASS b/B
                	COMMENT Other docs
                """;

        String[] owners = JavadocMappings.readDirectory(
                new byte[][] { first.getBytes(UTF_8), second.getBytes(UTF_8) },
                new String[] { "a/A.mapping", "b/B.mapping" });

        assertArrayEquals(new String[] { "a/A", "b/B" }, owners);
        assertEquals("Class docs", JavadocMappings.get(JavadocMappings.CLASS, "a/A", "", ""));
        assertEquals("Field docs", JavadocMappings.get(JavadocMappings.FIELD, "a/A", "value", "I"));
        assertEquals("Method docs", JavadocMappings.get(JavadocMappings.METHOD, "a/A", "run", "()V"));
        assertEquals("Inner docs", JavadocMappings.get(JavadocMappings.CLASS, "a/A$Inner", "", ""));
    }

    @Test
    void writesOnlyRequestedOuterClass() throws IOException {
        String first = """
                CLASS a/A
                	FIELD value I
                		COMMENT Field docs
                """;
        String second = """
                CLASS b/B
                	COMMENT Other docs
                """;
        JavadocMappings.readDirectory(
                new byte[][] { first.getBytes(UTF_8), second.getBytes(UTF_8) },
                new String[] { "a/A.mapping", "b/B.mapping" });

        String output = new String(JavadocMappings.writeClass("a/A$Inner"), UTF_8);

        assertTrue(output.contains("CLASS a/A"));
        assertTrue(output.contains("FIELD value I"));
        assertFalse(output.contains("b/B"));
    }

    @Test
    void removingLastCommentProducesNoFile() throws IOException {
        String mapping = """
                CLASS a/A
                	METHOD run ()V
                		COMMENT Method docs
                """;
        JavadocMappings.readDirectory(
                new byte[][] { mapping.getBytes(UTF_8) },
                new String[] { "a/A.mapping" });

        JavadocMappings.set(JavadocMappings.METHOD, "a/A", "run", "()V", null);

        assertEquals(0, JavadocMappings.writeClass("a/A").length);
    }

    @Test
    void rejectsDuplicateAndMultiRootFilesWithoutReplacingActiveMappings() throws IOException {
        String valid = "CLASS current/Mapping\n\tCOMMENT Current docs\n";
        JavadocMappings.readDirectory(
                new byte[][] { valid.getBytes(UTF_8) },
                new String[] { "current/Mapping.mapping" });

        assertThrows(IOException.class, () -> JavadocMappings.readDirectory(
                new byte[][] { "CLASS a/A\n".getBytes(UTF_8), "CLASS a/A\n".getBytes(UTF_8) },
                new String[] { "a/A.mapping", "a/A.mapping" }));
        assertThrows(IOException.class, () -> JavadocMappings.readDirectory(
                new byte[][] { "CLASS a/A\nCLASS b/B\n".getBytes(UTF_8) },
                new String[] { "mixed.mapping" }));
        assertThrows(IOException.class, () -> JavadocMappings.readDirectory(
                new byte[][] { "CLASS a/A\n".getBytes(UTF_8) },
                new String[] { "wrong/A.mapping" }));
        assertEquals("Current docs", JavadocMappings.get(JavadocMappings.CLASS, "current/Mapping", "", ""));
    }
}
