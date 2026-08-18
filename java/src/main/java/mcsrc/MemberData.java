package mcsrc;

import java.util.Set;

public record MemberData(String className, Set<Entry.Method> methods, Set<Entry.Field> fields) {
    public MemberData {
        methods = Set.copyOf(methods);
        fields = Set.copyOf(fields);
    }
}
