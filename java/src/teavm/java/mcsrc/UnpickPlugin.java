package mcsrc;

import org.teavm.model.MethodReference;
import org.teavm.model.ReferenceCache;
import org.teavm.model.ValueType;
import org.teavm.model.instructions.InvokeInstruction;
import org.teavm.parsing.ClassRefsRenamer;
import org.teavm.vm.spi.TeaVMHost;
import org.teavm.vm.spi.TeaVMPlugin;

public final class UnpickPlugin implements TeaVMPlugin {
    @Override
    public void install(TeaVMHost host) {
        host.add((cls, context) -> {
            if (!cls.getName().startsWith("daomephsta.unpick.")) {
                return;
            }
            new ClassRefsRenamer(new ReferenceCache(), name -> name.equals("java.io.LineNumberReader")
                    ? "mcsrc.compat.LineNumberReader" : name).rename(cls);
            for (var method : cls.getMethods()) {
                if (method.getProgram() == null) {
                    continue;
                }

                for (var block : method.getProgram().getBasicBlocks()) {
                    for (var instruction : block) {
                        if (instruction instanceof InvokeInstruction invoke
                                && invoke.getMethod().getClassName().equals("java.util.concurrent.ConcurrentHashMap")
                                && invoke.getMethod().getName().equals("newKeySet")) {
                            invoke.setMethod(new MethodReference("mcsrc.compat.UnpickRuntime", "newKeySet", ValueType.object("java.util.Set")));
                        }

                        if (instruction instanceof InvokeInstruction invoke
                                && (invoke.getMethod().getClassName().equals("java.lang.Integer")
                                    || invoke.getMethod().getClassName().equals("java.lang.Long"))
                                && invoke.getMethod().getName().startsWith("parseUnsigned")) {
                            invoke.setMethod(new MethodReference("mcsrc.compat.UnpickRuntime", invoke.getMethod().getDescriptor()));
                        }
                    }
                }
            }
        });
    }
}
