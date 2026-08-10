package mcsrc;

import java.util.List;

public record ClassData(String name, String superName, List<String> interfaces, int access) {
    public ClassData {
        interfaces = List.copyOf(interfaces);
    }
}
