package mcsrc;

import java.util.Map;
import java.util.Set;

public record MemberData(
        String className,
        Set<Entry.Method> methods,
        Set<Entry.Field> fields,
        Map<Entry.Method, Integer> methodAccess,
        Map<Entry.Method, Entry.Method> methodBridges) {
    public MemberData(String className, Set<Entry.Method> methods, Set<Entry.Field> fields) {
        this(className, methods, fields, Map.of(), Map.of());
    }

    public MemberData {
        methods = Set.copyOf(methods);
        fields = Set.copyOf(fields);
        methodAccess = Map.copyOf(methodAccess);
        methodBridges = Map.copyOf(methodBridges);
    }
}
