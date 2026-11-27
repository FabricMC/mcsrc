package net.minecraft;

public class NavigationUsages {
    public String parentCall(NavigationParent<String> target) {
        return target.value("parent");
    }

    public String childCall(NavigationChild target) {
        return target.value("child");
    }

    public String siblingCall(NavigationChild.Nested target) {
        return target.value("sibling");
    }

    public String overloadCall(NavigationChild target) {
        return target.value(1);
    }

    public String multipleCalls(NavigationParent<String> parent, NavigationChild child) {
        return parent.value("parent") + child.value("child");
    }
}
