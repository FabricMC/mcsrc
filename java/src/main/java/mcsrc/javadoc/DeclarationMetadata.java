package mcsrc.javadoc;

import java.util.ArrayList;
import java.util.List;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.RecordComponentVisitor;
import org.objectweb.asm.signature.SignatureReader;
import org.objectweb.asm.signature.SignatureVisitor;

public record DeclarationMetadata(List<String> typeParameters, List<String> exceptions, List<String> recordComponents) {
    public DeclarationMetadata {
        typeParameters = List.copyOf(typeParameters);
        exceptions = List.copyOf(exceptions);
        recordComponents = List.copyOf(recordComponents);
    }

    /** Reads one declaration without indexing; an empty method name selects the class. */
    public static DeclarationMetadata read(byte[] classBytes, String methodName, String descriptor) {
        List<String> typeParameters = new ArrayList<>();
        List<String> exceptions = new ArrayList<>();
        List<String> recordComponents = new ArrayList<>();
        ClassVisitor visitor = new ClassVisitor(Opcodes.ASM9) {
            @Override
            public void visit(int version, int access, String name, String signature, String superName, String[] interfaces) {
                if (methodName.isEmpty()) {
                    readSignature(signature, typeParameters, exceptions);
                }
            }

            @Override
            public RecordComponentVisitor visitRecordComponent(String name, String descriptor, String signature) {
                if (methodName.isEmpty()) {
                    recordComponents.add(name);
                }
                return null;
            }

            @Override
            public MethodVisitor visitMethod(int access, String name, String methodDescriptor, String signature, String[] exceptionNames) {
                if (name.equals(methodName) && methodDescriptor.equals(descriptor)) {
                    readSignature(signature, typeParameters, exceptions);
                    // Signatures may omit throws clauses when no generic exception types are needed.
                    if (exceptions.isEmpty() && exceptionNames != null) {
                        for (String exception : exceptionNames) {
                            exceptions.add(sourceName(exception));
                        }
                    }
                }
                return null;
            }
        };
        new ClassReader(classBytes).accept(visitor, ClassReader.SKIP_CODE | ClassReader.SKIP_DEBUG | ClassReader.SKIP_FRAMES);
        return new DeclarationMetadata(typeParameters, exceptions, recordComponents);
    }

    private static void readSignature(String signature, List<String> typeParameters, List<String> exceptions) {
        if (signature == null) {
            return;
        }
        new SignatureReader(signature).accept(new SignatureVisitor(Opcodes.ASM9) {
            @Override
            public void visitFormalTypeParameter(String name) {
                typeParameters.add(name);
            }

            @Override
            public SignatureVisitor visitExceptionType() {
                return new SignatureVisitor(Opcodes.ASM9) {
                    private final StringBuilder name = new StringBuilder();

                    @Override
                    public void visitTypeVariable(String name) {
                        exceptions.add(name);
                    }

                    @Override
                    public void visitClassType(String className) {
                        name.append(sourceName(className));
                    }

                    @Override
                    public void visitInnerClassType(String className) {
                        name.append('.').append(className);
                    }

                    @Override
                    public void visitEnd() {
                        exceptions.add(name.toString());
                    }
                };
            }
        });
    }

    private static String sourceName(String name) {
        return name.replace('/', '.').replace('$', '.');
    }
}
