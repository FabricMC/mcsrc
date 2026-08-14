package mcsrc;

import java.util.Map;

public record IndexData(Map<String, ClassData> classes, Map<String, MemberData> members) {
    public IndexData {
        classes = Map.copyOf(classes);
        members = Map.copyOf(members);
    }

  public static IndexData empty() {
        return new IndexData(Map.of(), Map.of());
    }
}
