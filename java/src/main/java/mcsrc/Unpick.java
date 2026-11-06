package mcsrc;

import java.io.IOException;
import java.io.StringReader;
import java.util.function.Function;

import daomephsta.unpick.api.ConstantUninliner;
import daomephsta.unpick.api.classresolvers.IClassResolver;
import daomephsta.unpick.api.constantgroupers.ConstantGroupers;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.tree.ClassNode;

public final class Unpick {
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
            builder.mappingSource(new StringReader(definition));
        }

        uninliner = ConstantUninliner.builder()
                .classResolver(resolver)
                .grouper(builder.build())
                .build();
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
