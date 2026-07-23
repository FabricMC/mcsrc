package mcsrc;

import java.util.Map;
import java.util.Set;

public record IndexData(Map<String, ClassData> classes, Map<String, MemberData> members,
                        Map<String, Set<String>> strings) {
    public IndexData {
        classes = Map.copyOf(classes);
        members = Map.copyOf(members);
        strings = Map.copyOf(strings);
    }

    public static IndexData empty() {
        return new IndexData(Map.of(), Map.of(), Map.of());
    }
}
