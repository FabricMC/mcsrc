package mcsrc;

import static java.nio.charset.StandardCharsets.UTF_8;
import static mcsrc.JavadocMappings.ElementKind.CLASS;
import static mcsrc.JavadocMappings.ElementKind.FIELD;
import static mcsrc.JavadocMappings.ElementKind.METHOD;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;

import net.fabricmc.mappingio.format.MappingFormat;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class JavadocMappingsTest {
    private final JavadocMappings mappings = new JavadocMappings();

    @ParameterizedTest
    @EnumSource(value = MappingFormat.class, names = { "TINY_2_FILE", "ENIGMA_FILE" })
    void roundTripsEditedComments(MappingFormat format) throws IOException {
        mappings.set(CLASS, "a/A", "", "", "Class docs");
        mappings.set(FIELD, "a/A", "value", "I", "Field docs");
        mappings.set(METHOD, "a/A", "run", "()V", "Original docs");
        JavadocMappings loaded = new JavadocMappings();

        assertEquals(format, loaded.read(mappings.write(format)));
        loaded.set(METHOD, "a/A", "run", "()V", "Edited docs");
        JavadocMappings reloaded = new JavadocMappings();
        reloaded.read(loaded.write(format));

        assertEquals("Class docs", reloaded.get(CLASS, "a/A", "", ""));
        assertEquals("Field docs", reloaded.get(FIELD, "a/A", "value", "I"));
        assertEquals("Edited docs", reloaded.get(METHOD, "a/A", "run", "()V"));
        reloaded.set(METHOD, "a/A", "run", "()V", "");
        assertNull(reloaded.get(METHOD, "a/A", "run", "()V"));
    }

    @Test
    void keepsInstancesAndPendingImportsIndependent() throws IOException {
        JavadocMappings other = new JavadocMappings();
        mappings.set(CLASS, "a/A", "", "", "First docs");
        other.set(CLASS, "a/A", "", "", "Second docs");
        mappings.beginDirectory();
        other.beginDirectory();
        mappings.readDirectoryFile("CLASS b/B\n\tCOMMENT Imported docs\n".getBytes(UTF_8), "b/B.mapping");
        other.readDirectoryFile("CLASS c/C\n\tCOMMENT Other import\n".getBytes(UTF_8), "c/C.mapping");

        assertEquals("First docs", mappings.get(CLASS, "a/A", "", ""));
        assertEquals("Second docs", other.get(CLASS, "a/A", "", ""));
        mappings.finishDirectory();
        other.abortDirectory();

        assertEquals("Imported docs", mappings.get(CLASS, "b/B", "", ""));
        assertNull(mappings.get(CLASS, "a/A", "", ""));
        assertEquals("Second docs", other.get(CLASS, "a/A", "", ""));
        assertNull(other.get(CLASS, "c/C", "", ""));
        mappings.reset();
        assertNull(mappings.get(CLASS, "b/B", "", ""));
        assertEquals("Second docs", other.get(CLASS, "a/A", "", ""));
    }

    @Test
    void rejectsInvalidFilesWithoutReplacingCurrentMappings() throws IOException {
        mappings.set(CLASS, "a/A", "", "", "Original docs");
        byte[] wrongNamespace = "tiny\t2\t0\tintermediary\n".getBytes(UTF_8);

        assertThrows(IOException.class, () -> mappings.read(new byte[0]));
        assertThrows(IOException.class, () -> mappings.read("invalid".getBytes(UTF_8)));
        assertThrows(IOException.class, () -> mappings.read(wrongNamespace));
        assertEquals("Original docs", mappings.get(CLASS, "a/A", "", ""));
    }

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

        String[] owners = mappings.readDirectory(
                new byte[][] { first.getBytes(UTF_8), second.getBytes(UTF_8) },
                new String[] { "a/A.mapping", "b/B.mapping" });

        assertArrayEquals(new String[] { "a/A", "b/B" }, owners);
        assertEquals("Class docs", mappings.get(CLASS, "a/A", "", ""));
        assertEquals("Field docs", mappings.get(FIELD, "a/A", "value", "I"));
        assertEquals("Method docs", mappings.get(METHOD, "a/A", "run", "()V"));
        assertEquals("Inner docs", mappings.get(CLASS, "a/A$Inner", "", ""));
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
        mappings.readDirectory(
                new byte[][] { first.getBytes(UTF_8), second.getBytes(UTF_8) },
                new String[] { "a/A.mapping", "b/B.mapping" });

        String output = new String(mappings.writeClass("a/A$Inner"), UTF_8);

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
        mappings.readDirectory(
                new byte[][] { mapping.getBytes(UTF_8) },
                new String[] { "a/A.mapping" });

        mappings.set(METHOD, "a/A", "run", "()V", null);

        assertEquals(0, mappings.writeClass("a/A").length);
    }

    @Test
    void rejectsDuplicateAndMultiRootFilesWithoutReplacingActiveMappings() throws IOException {
        String valid = "CLASS current/Mapping\n\tCOMMENT Current docs\n";
        mappings.readDirectory(
                new byte[][] { valid.getBytes(UTF_8) },
                new String[] { "current/Mapping.mapping" });

        assertThrows(IOException.class, () -> mappings.readDirectory(
                new byte[][] { "CLASS a/A\n".getBytes(UTF_8), "CLASS a/A\n".getBytes(UTF_8) },
                new String[] { "a/A.mapping", "a/A.mapping" }));
        assertThrows(IOException.class, () -> mappings.readDirectory(
                new byte[][] { "CLASS a/A\nCLASS b/B\n".getBytes(UTF_8) },
                new String[] { "mixed.mapping" }));
        assertEquals("Current docs", mappings.get(CLASS, "current/Mapping", "", ""));
    }

    @Test
    void acceptsDirectoryFilesNamedAfterMappedClasses() throws IOException {
        String input = """
                CLASS a/A named/A
                \tCOMMENT Class docs
                \tMETHOD run ()V
                \t\tCOMMENT Method docs
                """;

        String[] owners = mappings.readDirectory(
                new byte[][] { input.getBytes(UTF_8) },
                new String[] { "named/A.mapping" });
        mappings.set(METHOD, "a/A", "run", "()V", "Edited docs");
        String output = new String(mappings.writeClass("a/A"), UTF_8);

        assertArrayEquals(new String[] { "a/A" }, owners);
        assertEquals("Class docs", mappings.get(CLASS, "a/A", "", ""));
        assertTrue(output.contains("CLASS a/A named/A"));
        assertTrue(output.contains("COMMENT Edited docs"));
    }

    @Test
    void preservesLeadingDollarSignsInOuterClassNames() throws IOException {
        mappings.beginDirectory();
        mappings.finishDirectory();
        mappings.set(CLASS, "$Proxy$Inner", "", "", "Inner docs");
        JavadocMappings loaded = new JavadocMappings();

        loaded.read(mappings.writeClass("$Proxy"));

        assertEquals("Inner docs", loaded.get(CLASS, "$Proxy$Inner", "", ""));
    }
}
