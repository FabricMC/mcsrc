package mcsrc;

import org.teavm.jso.JSBody;
import org.teavm.jso.JSObject;

public interface Context extends JSObject {
    // Usage string one of:
    // c:className
    // m:owner:name:desc
    // f:owner:name:desc

    @JSBody(params = {"clazz", "usage"}, script = "this.addClassUsage(clazz, usage);")
    void addClassUsage(String clazz, String usage);

    @JSBody(params = {"method", "usage"}, script = "this.addMethodUsage(method, usage);")
    void addMethodUsage(String method, String usage);

    @JSBody(params = {"field", "usage"}, script = "this.addFieldUsage(field, usage);")
    void addFieldUsage(String field, String usage);
}
