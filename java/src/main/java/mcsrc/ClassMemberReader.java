package mcsrc;

import java.util.ArrayList;
import java.util.List;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.ClassNode;

public final class ClassMemberReader {
    private ClassMemberReader() {
    }

    /** Reads the fields and methods declared by a single class. */
    public static List<ClassMember> read(byte[] bytes) {
        var node = new ClassNode();
        new ClassReader(bytes).accept(node, ClassReader.SKIP_CODE | ClassReader.SKIP_FRAMES);

        var members = new ArrayList<ClassMember>(node.fields.size() + node.methods.size());
        for (var field : node.fields) {
            members.add(new ClassMember(MemberKind.FIELD, field.name, field.desc, (field.access & Opcodes.ACC_STATIC) != 0, List.of()));
        }
        for (var method : node.methods) {
            List<String> parameterNames = method.parameters == null
                    ? List.of()
                    : method.parameters.stream().map(parameter -> parameter.name).toList();
            members.add(new ClassMember(MemberKind.METHOD, method.name, method.desc, (method.access & Opcodes.ACC_STATIC) != 0, parameterNames));
        }
        return members;
    }

    public enum MemberKind {
        FIELD, METHOD
    }

    /** Parameter names follow descriptor order, with null entries for unnamed parameters. */
    public record ClassMember(MemberKind kind, String name, String descriptor, boolean isStatic, List<String> parameterNames) {
    }
}
