package mcsrc;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.LabelNode;
import org.objectweb.asm.tree.LocalVariableNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.ParameterNode;

public class LocalRenameVisitor extends ClassVisitor {
    public LocalRenameVisitor(int api, ClassVisitor classVisitor) {
        super(api, classVisitor);
    }

    @Override
    public MethodVisitor visitMethod(int access, String name, String descriptor, String signature, String[] exceptions) {
        MethodVisitor methodVisitor = super.visitMethod(access, name, descriptor, signature, exceptions);

        if (methodVisitor == null) {
            return null;
        }

        return new LocalRenameMethodVisitor(api, methodVisitor, access, name, descriptor, signature, exceptions);
    }

    private static final class LocalRenameMethodVisitor extends MethodNode {
        private final MethodVisitor output;
        private final Map<String, Integer> nameCounts = new HashMap<>();

        private LocalRenameMethodVisitor(int api, MethodVisitor output, int access, String name, String descriptor, String signature, String[] exceptions) {
            super(api, access, name, descriptor, signature, exceptions);
            this.output = output;
        }

        @Override
        public void visitEnd() {
            processLocals();
            super.visitEnd();
            accept(output);
        }

        private void processLocals() {
            boolean isStatic = (access & Opcodes.ACC_STATIC) != 0;
            Type[] argTypes = Type.getArgumentTypes(desc);
            int argLvSize = getLvIndex(argTypes.length, isStatic, argTypes);
            String[] args = new String[argTypes.length];

            for (int i = 0; i < args.length; i++) {
                args[i] = getNameFromType(argTypes[i].getDescriptor(), true);
            }

            boolean hasMethodBody = (access & Opcodes.ACC_ABSTRACT) == 0;

            if (localVariables != null || hasMethodBody && args.length > 0) {
                if (localVariables == null) {
                    localVariables = new ArrayList<>();
                }

                boolean[] argsWritten = new boolean[args.length];

                lvLoop: for (int i = 0; i < localVariables.size(); i++) {
                    LocalVariableNode local = localVariables.get(i);

                    if (!isStatic && local.index == 0) {
                        local.name = "this";
                    } else if (local.index < argLvSize) {
                        int asmIndex = getAsmIndex(local.index, isStatic, argTypes);

                        if (asmIndex >= 0) {
                            local.name = args[asmIndex];
                            argsWritten[asmIndex] = true;
                        }
                    } else {
                        for (int j = 0; j < i; j++) {
                            LocalVariableNode otherLocal = localVariables.get(j);

                            if (otherLocal.index == local.index && otherLocal.name != null && otherLocal.desc.equals(local.desc)) {
                                local.name = otherLocal.name;
                                continue lvLoop;
                            }
                        }

                        local.name = getNameFromType(local.desc, false);
                    }
                }

                LabelNode start = null;
                LabelNode end = null;

                for (int i = 0; i < args.length; i++) {
                    if (!argsWritten[i]) {
                        if (start == null) {
                            LabelRange labelRange = getMethodLabelRange();
                            start = labelRange.start;
                            end = labelRange.end;
                        }

                        localVariables.add(new LocalVariableNode(args[i], argTypes[i].getDescriptor(), null, start, end, getLvIndex(i, isStatic, argTypes)));
                    }
                }
            }

            if (parameters != null || args.length > 0) {
                if (parameters == null) {
                    parameters = new ArrayList<>(args.length);
                }

                while (parameters.size() < args.length) {
                    parameters.add(new ParameterNode(null, 0));
                }

                for (int i = 0; i < args.length; i++) {
                    parameters.get(i).name = args[i];
                }
            }
        }

        private LabelRange getMethodLabelRange() {
            LabelNode start = null;
            LabelNode end = null;
            boolean pastStart = false;

            for (Iterator<AbstractInsnNode> it = instructions.iterator(); it.hasNext();) {
                AbstractInsnNode instruction = it.next();

                if (instruction.getType() == AbstractInsnNode.LABEL) {
                    LabelNode label = (LabelNode) instruction;
                    if (start == null && !pastStart) {
                        start = label;
                    }
                    end = label;
                } else if (instruction.getOpcode() >= 0) {
                    pastStart = true;
                    end = null;
                }
            }

            if (start == null) {
                start = new LabelNode();
                instructions.insert(start);
            }

            if (end == null) {
                if (!pastStart) {
                    end = start;
                } else {
                    end = new LabelNode();
                    instructions.add(end);
                }
            }

            return new LabelRange(start, end);
        }

        private static int getLvIndex(int asmIndex, boolean isStatic, Type[] argTypes) {
            int ret = isStatic ? 0 : 1;

            for (int i = 0; i < asmIndex; i++) {
                ret += argTypes[i].getSize();
            }

            return ret;
        }

        private static int getAsmIndex(int lvIndex, boolean isStatic, Type[] argTypes) {
            if (!isStatic) {
                lvIndex--;
            }

            for (int i = 0; i < argTypes.length; i++) {
                if (lvIndex == 0) {
                    return i;
                }

                lvIndex -= argTypes[i].getSize();
            }

            return -1;
        }

        private String getNameFromType(String type, boolean isArg) {
            boolean plural = false;

            if (type.charAt(0) == '[') {
                plural = true;
                type = type.substring(type.lastIndexOf('[') + 1);
            }

            boolean incrementLetter = true;
            String varName;

            switch (type.charAt(0)) {
                case 'B' -> varName = "b";
                case 'C' -> varName = "c";
                case 'D' -> varName = "d";
                case 'F' -> varName = "f";
                case 'I' -> varName = "i";
                case 'J' -> varName = "l";
                case 'S' -> varName = "s";
                case 'Z' -> {
                    varName = "bl";
                    incrementLetter = false;
                }
                case 'L' -> {
                    int start = type.lastIndexOf('/') + 1;
                    int startDollar = type.lastIndexOf('$') + 1;

                    if (startDollar > start && startDollar < type.length() - 1) {
                        start = startDollar;
                    } else if (start == 0) {
                        start = 1;
                    }

                    char first = type.charAt(start);
                    char firstLc = Character.toLowerCase(first);

                    if (first == firstLc) {
                        varName = null;
                    } else {
                        varName = firstLc + type.substring(start + 1, type.length() - 1);
                    }

                    if (!isValidJavaIdentifier(varName)) {
                        varName = isArg ? "arg" : "lv";
                    }

                    incrementLetter = false;
                }
                default -> throw new IllegalStateException("Unexpected descriptor: " + type);
            }

            boolean hasPluralS = false;

            if (plural) {
                String pluralVarName = varName + 's';

                if (!isJavaKeyword(pluralVarName)) {
                    varName = pluralVarName;
                    hasPluralS = true;
                }
            }

            if (incrementLetter) {
                int index = -1;

                while (nameCounts.putIfAbsent(varName, 1) != null || isJavaKeyword(varName)) {
                    if (index < 0) {
                        index = getNameIndex(varName, hasPluralS);
                    }

                    varName = getIndexName(++index, plural);
                }

                return varName;
            }

            String baseVarName = varName;
            int count = nameCounts.compute(baseVarName, (key, value) -> value == null ? 1 : value + 1);

            if (count == 1) {
                if (isJavaKeyword(baseVarName)) {
                    varName += '_';
                } else {
                    return varName;
                }
            } else {
                varName = baseVarName + count;
            }

            while (nameCounts.putIfAbsent(varName, 1) != null) {
                varName = baseVarName + count++;
            }

            nameCounts.put(baseVarName, count);
            return varName;
        }

        private static int getNameIndex(String name, boolean plural) {
            int ret = 0;

            for (int i = 0, max = name.length() - (plural ? 1 : 0); i < max; i++) {
                ret = ret * 26 + name.charAt(i) - 'a' + 1;
            }

            return ret - 1;
        }

        private static String getIndexName(int index, boolean plural) {
            if (index < 26 && !plural) {
                return SINGLE_CHAR_STRINGS[index];
            }

            StringBuilder ret = new StringBuilder(2);

            do {
                int next = index / 26;
                int cur = index - next * 26;
                ret.append((char) ('a' + cur));
                index = next - 1;
            } while (index >= 0);

            ret.reverse();

            if (plural) {
                ret.append('s');
            }

            return ret.toString();
        }

        private static boolean isValidJavaIdentifier(String name) {
            if (name == null || name.isEmpty() || !Character.isJavaIdentifierStart(name.charAt(0))) {
                return false;
            }

            for (int i = 1; i < name.length(); i++) {
                if (!Character.isJavaIdentifierPart(name.charAt(i)) || Character.isIdentifierIgnorable(name.charAt(i))) {
                    return false;
                }
            }

            return !name.codePoints().anyMatch(Character::isIdentifierIgnorable);
        }

        private static boolean isJavaKeyword(String name) {
            return JAVA_KEYWORDS.contains(name);
        }
    }

    private record LabelRange(LabelNode start, LabelNode end) {
    }

    private static final Set<String> JAVA_KEYWORDS = Set.of(
            "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
            "class", "const", "continue", "default", "do", "double", "else", "enum",
            "extends", "final", "finally", "float", "for", "goto", "if", "implements",
            "import", "instanceof", "int", "interface", "long", "native", "new", "package",
            "private", "protected", "public", "return", "short", "static", "strictfp",
            "super", "switch", "synchronized", "this", "throw", "throws", "transient",
            "try", "void", "volatile", "while", "true", "false", "null", "_"
    );

    private static final String[] SINGLE_CHAR_STRINGS = {
            "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
            "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
    };
}
