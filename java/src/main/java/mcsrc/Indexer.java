package mcsrc;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.FieldVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

public final class Indexer {
    private final Map<String, Set<String>> references = new HashMap<>();
    private final Map<String, ClassData> classes = new HashMap<>();
    private final Map<String, MutableMemberData> members = new HashMap<>();

    public void index(byte[] classBytes) {
        new ClassReader(classBytes).accept(new ClassIndexVisitor(this), ClassReader.SKIP_FRAMES);
    }

    public void indexDeclarations(byte[] classBytes) {
        new ClassReader(classBytes).accept(
                new DeclarationIndexVisitor(this),
                ClassReader.SKIP_CODE | ClassReader.SKIP_DEBUG | ClassReader.SKIP_FRAMES);
    }

    public Set<String> references(String key) {
        return Set.copyOf(references.getOrDefault(key, Set.of()));
    }

    public int referenceCount() {
        return references.values().stream().mapToInt(Set::size).sum();
    }

    public IndexData data() {
        Map<String, MemberData> memberData = new HashMap<>();
        members.forEach((name, data) -> memberData.put(name, data.snapshot()));
        return new IndexData(classes, memberData);
    }

    public void clear() {
        references.clear();
        classes.clear();
        members.clear();
    }

    void addReference(String key, String value) {
        if (key.startsWith("net/minecraft") || key.startsWith("com/mojang")) {
            references.computeIfAbsent(key, ignored -> new HashSet<>()).add(value);
        }
    }

    void addClass(String name, String superName, String[] interfaces, int access) {
        classes.put(name, new ClassData(name, superName, interfaces == null ? List.of() : List.of(interfaces), access));
    }

    void addMethod(Entry.Method method) {
        members.computeIfAbsent(method.owner(), MutableMemberData::new).methods.add(method);
    }

    void addField(Entry.Field field) {
        members.computeIfAbsent(field.owner(), MutableMemberData::new).fields.add(field);
    }

    private static final class MutableMemberData {
        private final String className;
        private final Set<Entry.Method> methods = new HashSet<>();
        private final Set<Entry.Field> fields = new HashSet<>();

        private MutableMemberData(String className) {
            this.className = className;
        }

        private MemberData snapshot() {
            return new MemberData(className, methods, fields);
        }
    }

    private static final class DeclarationIndexVisitor extends ClassVisitor {
        private final Indexer indexer;
        private String className;

        private DeclarationIndexVisitor(Indexer indexer) {
            super(Opcodes.ASM9);
            this.indexer = indexer;
        }

        @Override
        public void visit(int version, int access, String name, String signature, String superName, String[] interfaces) {
            className = name;
            indexer.addClass(name, superName, interfaces, access);
        }

        @Override
        public FieldVisitor visitField(int access, String name, String descriptor, String signature, Object value) {
            indexer.addField(new Entry.Field(className, name, descriptor));
            return null;
        }

        @Override
        public MethodVisitor visitMethod(int access, String name, String descriptor, String signature, String[] exceptions) {
            indexer.addMethod(new Entry.Method(className, name, descriptor));
            return null;
        }
    }
}
