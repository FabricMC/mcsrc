package mcsrc;

import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.FieldVisitor;
import org.objectweb.asm.Handle;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;

// Based on code from Enigma
final class ClassIndexVisitor extends ClassVisitor {
	private final Indexer indexer;
	private String name;

	ClassIndexVisitor(Indexer indexer) {
		super(Opcodes.ASM9);
		this.indexer = indexer;
    }

	@Override
	public void visit(int version, int access, String name, String signature, String superName, String[] interfaces) {
		this.name = name;
		indexer.addClass(name, superName, interfaces, access);
	}

	@Override
	public FieldVisitor visitField(int access, String name, String desc, String signature, Object value) {
		indexField(new Entry.Field(this.name, name, desc));
		return super.visitField(access, name, desc, signature, value);
	}

	@Override
	public MethodVisitor visitMethod(int access, String name, String desc, String signature, String[] exceptions) {
		Entry.Method method = indexer.addMethod(new Entry.Method(this.name, name, desc), access);
		int callerId = indexer.referenceId(method);
		indexMethodDescriptor(callerId, method.desc());
		return new IndexReferenceMethodVisitor(api, method, callerId, access);
	}

	private class IndexReferenceMethodVisitor extends MethodVisitor {
		private final Entry.Method callerEntry;
		private final int callerId;
        private final boolean bridge;

		IndexReferenceMethodVisitor(int api, Entry.Method callerEntry, int callerId, int access) {
            super(api, null);
            this.callerEntry = callerEntry;
			this.callerId = callerId;
            this.bridge = (access & Opcodes.ACC_BRIDGE) != 0;
		}

		@Override
		public void visitFieldInsn(int opcode, String owner, String name, String descriptor) {
			switch (opcode) {
			case Opcodes.GETSTATIC, Opcodes.PUTSTATIC, Opcodes.GETFIELD, Opcodes.PUTFIELD -> {
				if (Indexer.isReferenceTarget(owner)) {
					indexFieldReference(callerId, new Entry.Field(owner, name, descriptor));
				}
			}
            }

			super.visitFieldInsn(opcode, owner, name, descriptor);
		}

		@Override
		public void visitLdcInsn(Object value) {
			if (value instanceof Type type && (type.getSort() == Type.OBJECT || type.getSort() == Type.ARRAY)) {
				if (type.getSort() == Type.ARRAY) {
					type = type.getElementType();
				}

				indexer.addReference(type.getInternalName(), callerId);
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

				indexer.addReference(classType.getInternalName(), callerId);
			}

			super.visitTypeInsn(opcode, type);
		}

		@Override
		public void visitMethodInsn(int opcode, String owner, String name, String descriptor, boolean isInterface) {
			if (Indexer.isReferenceTarget(owner)) {
				indexMethodReference(callerId, new Entry.Method(owner, name, descriptor));
			}
            if (bridge && owner.equals(callerEntry.owner()) && name.equals(callerEntry.name())) {
                indexer.addMethodBridge(callerEntry, new Entry.Method(owner, name, descriptor));
            }
			super.visitMethodInsn(opcode, owner, name, descriptor, isInterface);
		}

		@Override
		public void visitInvokeDynamicInsn(String name, String descriptor, Handle bootstrapMethodHandle, Object... bootstrapMethodArguments) {
			if ("java/lang/invoke/LambdaMetafactory".equals(bootstrapMethodHandle.getOwner()) && ("metafactory".equals(bootstrapMethodHandle.getName()) || "altMetafactory".equals(bootstrapMethodHandle.getName()))) {
				Type samMethodType = (Type) bootstrapMethodArguments[0];
				Handle implMethod = (Handle) bootstrapMethodArguments[1];
				Type instantiatedMethodType = (Type) bootstrapMethodArguments[2];

				if (Indexer.isReferenceTarget(implMethod.getOwner())) {
					switch (getHandleEntry(implMethod)) {
						case Entry.Field field -> indexFieldReference(callerId, field);
						case Entry.Method method -> indexMethodReference(callerId, method);
					}
				}

				indexMethodDescriptor(callerId, descriptor);
				indexMethodDescriptor(callerId, samMethodType.getDescriptor());
				indexMethodDescriptor(callerId, instantiatedMethodType.getDescriptor());
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

	private void indexMethodDescriptor(int callerId, String descriptor) {
		for (Type typeDescriptor : Type.getArgumentTypes(descriptor)) {
			indexMethodType(callerId, typeDescriptor);
	}

		indexMethodType(callerId, Type.getReturnType(descriptor));
		}

	private void indexMethodType(int callerId, Type type) {
		if (type.getSort() == Type.ARRAY) {
			indexMethodType(callerId, type.getElementType());
			return;
		}

		if (type.getSort() == Type.OBJECT) {
			indexer.addReference(type.getInternalName(), callerId);
		}
	}

	private void indexField(Entry.Field field) {
		field = indexer.addField(field);
		Type type = Type.getType(field.desc());

		if (type.getSort() == Type.ARRAY) {
			type = type.getElementType();
		}

		if (type.getSort() == Type.OBJECT) {
			indexer.addReference(type.getInternalName(), indexer.referenceId(field));
		}
	}

	private void indexMethodReference(int callerId, Entry.Method referencedEntry) {
		indexer.addReference(referencedEntry.str(), callerId);

		if (referencedEntry.name().equals("<init>")) {
			indexer.addReference(referencedEntry.owner(), callerId);
		}
	}

	private void indexFieldReference(int callerId, Entry.Field referencedEntry) {
		indexer.addReference(referencedEntry.str(), callerId);
	}
}
