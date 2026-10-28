package mcsrc.javadoc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;

class DeclarationMetadataTest {
    @Test
    void readsClassParametersWithoutBoundsOrReferencedTypes() {
        DeclarationMetadata metadata = DeclarationMetadata.read(classBytes(), "", "");
        assertEquals(List.of("T", "U"), metadata.typeParameters());
        assertEquals(List.of(), metadata.exceptions());
        assertEquals(List.of(), metadata.recordComponents());
    }

    @Test
    void selectsMethodParametersAndExceptionsByNameAndDescriptor() {
        DeclarationMetadata first = DeclarationMetadata.read(classBytes(), "convert", "()Ljava/lang/Exception;");
        DeclarationMetadata second = DeclarationMetadata.read(classBytes(), "convert", "(I)Ljava/lang/Object;");
        assertEquals(List.of("E"), first.typeParameters());
        assertEquals(List.of("java.io.IOException", "E", "T"), first.exceptions());
        assertEquals(List.of("V", "W"), second.typeParameters());
        assertEquals(List.of("java.lang.IllegalArgumentException"), second.exceptions());
    }

    @Test
    void readsConstructorParametersAndExceptions() {
        DeclarationMetadata metadata = DeclarationMetadata.read(classBytes(), "<init>", "(Ljava/lang/Object;)V");
        assertEquals(List.of("C"), metadata.typeParameters());
        assertEquals(List.of("java.io.IOException"), metadata.exceptions());
    }

    @Test
    void usesTheExceptionAttributeWhenThereIsNoGenericSignature() {
        DeclarationMetadata metadata = DeclarationMetadata.read(classBytes(), "plain", "()V");
        assertEquals(List.of(), metadata.typeParameters());
        assertEquals(List.of("example.Outer.Failure"), metadata.exceptions());
    }

    @Test
    void doesNotInheritClassParametersOrInferThemFromGenericReturnTypes() {
        assertEquals(List.of(), DeclarationMetadata.read(classBytes(), "value", "()Ljava/util/List;").typeParameters());
        assertEquals(new DeclarationMetadata(List.of(), List.of(), List.of()), DeclarationMetadata.read(classBytes(), "missing", "()V"));
    }

    @Test
    void readsRecordComponentsInDeclarationOrderWithoutIncludingFields() {
        ClassWriter writer = new ClassWriter(0);
        writer.visit(Opcodes.V25, Opcodes.ACC_PUBLIC | Opcodes.ACC_FINAL | Opcodes.ACC_RECORD, "example/Record",
                "<T:Ljava/lang/Object;>Ljava/lang/Record;", "java/lang/Record", null);
        writer.visitRecordComponent("value", "Ljava/lang/Object;", "TT;").visitEnd();
        writer.visitRecordComponent("count", "I", null).visitEnd();
        writer.visitField(Opcodes.ACC_PRIVATE | Opcodes.ACC_FINAL, "count", "I", null, null).visitEnd();
        writer.visitField(Opcodes.ACC_PRIVATE | Opcodes.ACC_FINAL, "value", "Ljava/lang/Object;", "TT;", null).visitEnd();
        writer.visitField(Opcodes.ACC_STATIC, "extra", "I", null, null).visitEnd();
        writer.visitMethod(Opcodes.ACC_PUBLIC, "value", "()Ljava/lang/Object;", "()TT;", null).visitEnd();
        writer.visitEnd();

        DeclarationMetadata metadata = DeclarationMetadata.read(writer.toByteArray(), "", "");
        assertEquals(List.of("T"), metadata.typeParameters());
        assertEquals(List.of("value", "count"), metadata.recordComponents());
        assertEquals(List.of(), DeclarationMetadata.read(writer.toByteArray(), "value", "()Ljava/lang/Object;").recordComponents());
    }

    private static byte[] classBytes() {
        ClassWriter writer = new ClassWriter(0);
        writer.visit(Opcodes.V25, Opcodes.ACC_PUBLIC | Opcodes.ACC_ABSTRACT, "example/Owner",
                "<T:Ljava/lang/Exception;:Ljava/lang/Comparable<TT;>;U:Ljava/lang/Object;>Ljava/lang/Object;",
                "java/lang/Object", null);
        writer.visitMethod(Opcodes.ACC_PUBLIC, "<init>", "(Ljava/lang/Object;)V", "<C:Ljava/lang/Object;>(TC;)V",
                new String[] { "java/io/IOException" }).visitEnd();
        writer.visitMethod(Opcodes.ACC_PUBLIC | Opcodes.ACC_ABSTRACT, "convert", "()Ljava/lang/Exception;",
                "<E:Ljava/lang/Exception;>()TE;^Ljava/io/IOException;^TE;^TT;",
                new String[] { "java/io/IOException", "java/lang/Exception", "java/lang/Exception" }).visitEnd();
        writer.visitMethod(Opcodes.ACC_PUBLIC | Opcodes.ACC_ABSTRACT, "convert", "(I)Ljava/lang/Object;",
                "<V:Ljava/lang/Object;W:TV;>(I)TW;", new String[] { "java/lang/IllegalArgumentException" }).visitEnd();
        writer.visitMethod(Opcodes.ACC_PUBLIC | Opcodes.ACC_ABSTRACT, "value", "()Ljava/util/List;", "()Ljava/util/List<TT;>;", null).visitEnd();
        writer.visitMethod(Opcodes.ACC_PUBLIC | Opcodes.ACC_ABSTRACT, "plain", "()V", null,
                new String[] { "example/Outer$Failure" }).visitEnd();
        writer.visitEnd();
        return writer.toByteArray();
    }
}
