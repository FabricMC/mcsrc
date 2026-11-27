package mcsrc;

import java.io.IOException;
import java.io.StringReader;
import java.util.function.Function;
import java.util.function.Predicate;

import daomephsta.unpick.api.ConstantUninliner;
import daomephsta.unpick.api.ValidatingUnpickV3Visitor;
import daomephsta.unpick.api.classresolvers.IClassResolver;
import daomephsta.unpick.api.constantgroupers.ConstantGroupers;
import daomephsta.unpick.constantmappers.datadriven.parser.UnpickSyntaxException;
import daomephsta.unpick.constantmappers.datadriven.parser.v3.UnpickV3Reader;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.tree.ClassNode;

public final class Unpick {
    private static final String VERSION_HEADER = "unpick v4";

    private final IClassResolver resolver;
    private ConstantUninliner uninliner;

    public Unpick(Function<String, byte[]> source) {
        resolver = name -> {
            byte[] bytes = source.apply(name);
            if (bytes == null) {
                return null;
            }
            var node = new ClassNode();
            new ClassReader(bytes).accept(node, ClassReader.SKIP_DEBUG | ClassReader.SKIP_FRAMES);
            return node;
        };
    }

    public void loadDefinitions(String[] definitions) throws IOException {
        var builder = ConstantGroupers.dataDriven().classResolver(resolver);

        for (String definition : definitions) {
            builder.mappingSource(openDefinition(definition));
        }

        uninliner = ConstantUninliner.builder()
                .classResolver(resolver)
                .grouper(builder.build())
                .build();
    }

    /** Returns the first diagnostic, or null when all definitions are valid. */
    public UnpickDiagnostic validateDefinitions(String[] definitions, Predicate<String> hasPackage) throws IOException {
        var validator = new ValidatingUnpickV3Visitor(resolver) {
            @Override
            public boolean packageExists(String packageName) {
                return hasPackage.test(packageName);
            }
        };

        for (int index = 0; index < definitions.length; index++) {
            try (var reader = new UnpickV3Reader(openDefinition(definitions[index]))) {
                reader.accept(validator);
            } catch (UnpickSyntaxException exception) {
                return new UnpickDiagnostic(index, exception);
            }
        }

        var errors = validator.finishValidation();
        if (errors.isEmpty()) return null;

        // The visitor doesn't attach a file or position to semantic errors.
        return new UnpickDiagnostic(definitions.length == 1 ? 0 : -1, errors.getFirst());
    }

    private static StringReader openDefinition(String definition) {
        if (!definition.equals(VERSION_HEADER)
                && !definition.startsWith(VERSION_HEADER + "\n")
                && !definition.startsWith(VERSION_HEADER + "\r")) {
            throw new UnpickSyntaxException(1, 1, "Expected version header: " + VERSION_HEADER);
        }
        return new StringReader(definition);
    }

    /** A definition index of -1 indicates a project-wide diagnostic. */
    public record UnpickDiagnostic(int definitionIndex, UnpickSyntaxException exception) {
    }

    public byte[] apply(byte[] bytes) {
        if (uninliner == null) {
            throw new IllegalStateException("Unpick definitions have not been loaded");
        }

        var node = new ClassNode();
        new ClassReader(bytes).accept(node, 0);
        uninliner.transform(node);

        var writer = new ClassWriter(ClassWriter.COMPUTE_MAXS) {
            @Override
            protected String getCommonSuperClass(String first, String second) {
                // Default impl class Class.forName, this is unsupported in TeaVM. Seems to work fine without it?
                throw new UnsupportedOperationException();
            }
        };
        node.accept(writer);
        return writer.toByteArray();
    }
}
