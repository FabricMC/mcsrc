package mcsrc;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.FieldVisitor;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

public final class Indexer {
    private Map<String, ReferenceList> references = new HashMap<>();
    private Map<String, ClassData> classes = new HashMap<>();
    private Map<String, MutableMemberData> members = new HashMap<>();
    private Map<Entry.Member, Integer> referenceIds;
    private Map<String, String> strings;
    private final ArrayList<Entry.Member> callers = new ArrayList<>();

    public void index(byte[] classBytes) {
        new ClassReader(classBytes).accept(new ClassIndexVisitor(this), ClassReader.SKIP_FRAMES);
    }

    public void indexDeclarations(byte[] classBytes) {
        new ClassReader(classBytes).accept(
                new DeclarationIndexVisitor(this),
                ClassReader.SKIP_CODE | ClassReader.SKIP_DEBUG | ClassReader.SKIP_FRAMES);
    }

    public Set<String> references(String key) {
        return Set.of(referenceArray(key));
    }

    /** Returns the distinct callers of a class or member, in reference-string format. */
    public String[] referenceArray(String key) {
        ReferenceList references = this.references.get(key);
        if (references == null) {
            return new String[0];
        }
        int[] ids = references.ids();
        String[] result = new String[ids.length];
        for (int i = 0; i < ids.length; i++) {
            result[i] = callers.get(ids[i]).reference();
        }
        return result;
    }

    public int referenceCount() {
        return references.values().stream().mapToInt(list -> list.ids().length).sum();
    }

    /** Returns class declarations without copying unrelated member data. */
    public Stream<ClassData> classData() {
        return classes.values().stream();
    }

    /** Returns snapshots of the member declarations in each indexed class. */
    public Stream<MemberData> memberData() {
        return members.values().stream().map(MutableMemberData::snapshot);
    }

    public IndexData data() {
        Map<String, MemberData> memberData = new HashMap<>();
        members.forEach((name, data) -> memberData.put(name, data.snapshot()));
        return new IndexData(classes, memberData);
    }

    public void clear() {
        references = new HashMap<>();
        classes = new HashMap<>();
        members = new HashMap<>();
        callers.clear();
        callers.trimToSize();
        referenceIds = null;
        strings = null;
    }

    /** Compacts the index and releases build-only dictionaries. Further indexing is supported. */
    public void finish() {
        for (ReferenceList list : references.values()) {
            list.ids();
        }
        callers.trimToSize();
        referenceIds = null;
        strings = null;
    }

    int referenceId(Entry.Member caller) {
        if (referenceIds == null) {
            referenceIds = new HashMap<>();
            for (int i = 0; i < callers.size(); i++) {
                referenceIds.put(callers.get(i), i);
            }
        }
        Integer id = referenceIds.get(caller);
        if (id == null) {
            id = callers.size();
            callers.add(caller);
            referenceIds.put(caller, id);
        }
        return id;
    }

    void addReference(String key, int callerId) {
        if (isReferenceTarget(key)) {
            references.computeIfAbsent(key, ignored -> new ReferenceList()).add(callerId);
        }
    }

    static boolean isReferenceTarget(String name) {
        return name.startsWith("net/minecraft") || name.startsWith("com/mojang");
    }

    private String canonicalString(String value) {
        if (value == null) {
            return null;
        }
        if (strings == null) {
            strings = new HashMap<>();
        }
        return strings.computeIfAbsent(value, key -> key);
    }

    void addClass(String name, String superName, String[] interfaces, int access) {
        name = canonicalString(name);
        List<String> interfaceNames = new ArrayList<>();
        if (interfaces != null) {
            for (String interfaceName : interfaces) {
                interfaceNames.add(canonicalString(interfaceName));
            }
        }
        classes.put(name, new ClassData(name, canonicalString(superName), interfaceNames, access));
    }

    Entry.Method addMethod(Entry.Method method, int access) {
        method = canonicalMethod(method);
        MutableMemberData data = members.computeIfAbsent(method.owner(), MutableMemberData::new);
        data.methods.add(method);
        data.methodAccess.put(method, access);
        return method;
    }

    private Entry.Method canonicalMethod(Entry.Method method) {
        return new Entry.Method(canonicalString(method.owner()), canonicalString(method.name()), canonicalString(method.desc()));
    }

    void addMethodBridge(Entry.Method bridge, Entry.Method target) {
        members.computeIfAbsent(bridge.owner(), MutableMemberData::new).methodBridges.put(bridge, canonicalMethod(target));
    }

    Entry.Field addField(Entry.Field field) {
        field = new Entry.Field(canonicalString(field.owner()), canonicalString(field.name()), canonicalString(field.desc()));
        members.computeIfAbsent(field.owner(), MutableMemberData::new).fields.add(field);
        return field;
    }

    private static final class MutableMemberData {
        private final String className;
        private final Set<Entry.Method> methods = new HashSet<>();
        private final Map<Entry.Method, Integer> methodAccess = new HashMap<>();
        private final Map<Entry.Method, Entry.Method> methodBridges = new HashMap<>();
        private final Set<Entry.Field> fields = new HashSet<>();

        private MutableMemberData(String className) {
            this.className = className;
        }

        private MemberData snapshot() {
            return new MemberData(className, methods, fields, methodAccess, methodBridges);
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
            indexer.addMethod(new Entry.Method(className, name, descriptor), access);
            return null;
        }
    }
}
