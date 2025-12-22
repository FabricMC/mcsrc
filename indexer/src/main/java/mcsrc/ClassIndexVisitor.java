package mcsrc;

import org.objectweb.asm.*;

// Based on code from Enigma
public class ClassIndexVisitor extends ClassVisitor {
	private final Context context;
	private String name;

	public ClassIndexVisitor(int api, Context context) {
		super(api);
        this.context = context;
    }

	@Override
	public void visit(int version, int access, String name, String signature, String superName, String[] interfaces) {
		this.name = name;
	}

	@Override
	public FieldVisitor visitField(int access, String name, String desc, String signature, Object value) {
		indexField(new Entry.Field(this.name, name, desc));
		return super.visitField(access, name, desc, signature, value);
	}

	@Override
	public MethodVisitor visitMethod(int access, String name, String desc, String signature, String[] exceptions) {
		indexMethod(new Entry.Method(this.name, name, desc));
		return new IndexReferenceMethodVisitor(api, new Entry.Method(this.name, name, desc));
	}

	private class IndexReferenceMethodVisitor extends MethodVisitor {
		private final Entry.Method callerEntry;

		IndexReferenceMethodVisitor(int api, Entry.Method callerEntry) {
            super(api, null);
            this.callerEntry = callerEntry;
		}

		@Override
		public void visitFieldInsn(int opcode, String owner, String name, String descriptor) {
			switch (opcode) {
			case Opcodes.GETSTATIC, Opcodes.PUTSTATIC, Opcodes.GETFIELD, Opcodes.PUTFIELD ->
					indexFieldReference(callerEntry, new Entry.Field(owner, name, descriptor));
            }

			super.visitFieldInsn(opcode, owner, name, descriptor);
		}

		@Override
		public void visitLdcInsn(Object value) {
			if (value instanceof Type type && (type.getSort() == Type.OBJECT || type.getSort() == Type.ARRAY)) {
				if (type.getSort() == Type.ARRAY) {
					type = type.getElementType();
				}

				indexClassReference(callerEntry, new Entry.Class(type.getInternalName()));
			}

			super.visitLdcInsn(value);
		}

		@Override
		public void visitTypeInsn(int opcode, String type) {
			if (opcode == Opcodes.INSTANCEOF || opcode == Opcodes.CHECKCAST) {
				Type classType = Type.getObjectType(type);

				if (classType.getSort() == Type.ARRAY) {
					classType = classType.getElementType();
				}

				indexClassReference(callerEntry, new Entry.Class(classType.getInternalName()));
			}

			super.visitTypeInsn(opcode, type);
		}

		@Override
		public void visitMethodInsn(int opcode, String owner, String name, String descriptor, boolean isInterface) {
			indexMethodReference(callerEntry, new Entry.Method(owner, name, descriptor));
			super.visitMethodInsn(opcode, owner, name, descriptor, isInterface);
		}

		@Override
		public void visitInvokeDynamicInsn(String name, String descriptor, Handle bootstrapMethodHandle, Object... bootstrapMethodArguments) {
			if ("java/lang/invoke/LambdaMetafactory".equals(bootstrapMethodHandle.getOwner()) && ("metafactory".equals(bootstrapMethodHandle.getName()) || "altMetafactory".equals(bootstrapMethodHandle.getName()))) {
				Type samMethodType = (Type) bootstrapMethodArguments[0];
				Handle implMethod = (Handle) bootstrapMethodArguments[1];
				Type instantiatedMethodType = (Type) bootstrapMethodArguments[2];

				switch (getHandleEntry(implMethod)) {
                    case Entry.Field field -> indexFieldReference(callerEntry, field);
                    case Entry.Method method -> indexMethodReference(callerEntry, method);
                }

				indexMethodDescriptor(callerEntry, descriptor);
				indexMethodDescriptor(callerEntry, samMethodType.getDescriptor());
				indexMethodDescriptor(callerEntry, instantiatedMethodType.getDescriptor());
			}

			super.visitInvokeDynamicInsn(name, descriptor, bootstrapMethodHandle, bootstrapMethodArguments);
		}

		private static Entry.Member getHandleEntry(Handle handle) {
			return switch (handle.getTag()) {
			case Opcodes.H_GETFIELD, Opcodes.H_GETSTATIC, Opcodes.H_PUTFIELD, Opcodes.H_PUTSTATIC ->
					new Entry.Field(handle.getOwner(), handle.getName(), handle.getDesc());
			case Opcodes.H_INVOKEINTERFACE, Opcodes.H_INVOKESPECIAL, Opcodes.H_INVOKESTATIC,
				Opcodes.H_INVOKEVIRTUAL, Opcodes.H_NEWINVOKESPECIAL ->
					new Entry.Method(handle.getOwner(), handle.getName(), handle.getDesc());
			default -> throw new RuntimeException("Invalid handle tag " + handle.getTag());
			};
		}
	}

	public void indexMethod(Entry.Method methodEntry) {
		indexMethodDescriptor(methodEntry, methodEntry.desc());
	}

	private void indexMethodDescriptor(Entry.Method entry, String descriptor) {
		for (Type typeDescriptor : Type.getArgumentTypes(descriptor)) {
			indexMethodType(entry, typeDescriptor);
		}

		indexMethodType(entry, Type.getReturnType(descriptor));
	}

	private void indexMethodType(Entry.Method method, Type type) {
		if (type.getSort() == Type.ARRAY) {
			indexMethodType(method, type.getElementType());
			return;
		}

		if (type.getSort() == Type.OBJECT) {
			context.addClassUsage(type.getClassName(), method.usage());
		}
	}

	public void indexField(Entry.Field field) {
		Type type = Type.getType(field.desc());

		if (type.getSort() == Type.ARRAY) {
			indexField(new Entry.Field(field.owner(), field.name(), type.getElementType().getDescriptor()));
			return;
		}

		if (type.getSort() == Type.OBJECT) {
			context.addClassUsage(type.getClassName(), field.usage());
		}
	}

	public void indexClassReference(Entry.Method callerEntry, Entry.Class referencedEntry) {
		context.addClassUsage(referencedEntry.name(), callerEntry.usage());
	}

	public void indexMethodReference(Entry.Method callerEntry, Entry.Method referencedEntry) {
		context.addMethodUsage(referencedEntry.str(), callerEntry.usage());

		if (referencedEntry.name().equals("<init>")) {
			context.addClassUsage(referencedEntry.owner(), callerEntry.usage());
		}
	}

	public void indexFieldReference(Entry.Method callerEntry, Entry.Field referencedEntry) {
		context.addFieldUsage(referencedEntry.str(), callerEntry.usage());
	}
}
