package mcsrc;

import org.objectweb.asm.AnnotationVisitor;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.FieldVisitor;
import org.objectweb.asm.Handle;
import org.objectweb.asm.Label;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.RecordComponentVisitor;
import org.objectweb.asm.Type;
import org.objectweb.asm.TypePath;

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
		Entry.Field field = new Entry.Field(this.name, name, desc);
		indexField(field);
		return new IndexReferenceFieldVisitor(api, field);
	}

	@Override
	public MethodVisitor visitMethod(int access, String name, String desc, String signature, String[] exceptions) {
		Entry.Method method = indexer.addMethod(new Entry.Method(this.name, name, desc), access);
		int callerId = indexer.referenceId(method);
		indexMethodDescriptor(callerId, method.desc());
		return new IndexReferenceMethodVisitor(api, method, callerId, access);
	}

	@Override
	public AnnotationVisitor visitAnnotation(String descriptor, boolean visible) {
		return indexAnnotation(indexer.referenceId(new Entry.Class(name)), descriptor);
	}

	@Override
	public AnnotationVisitor visitTypeAnnotation(int typeRef, TypePath typePath, String descriptor, boolean visible) {
		return indexAnnotation(indexer.referenceId(new Entry.Class(name)), descriptor);
	}

	@Override
	public RecordComponentVisitor visitRecordComponent(String name, String descriptor, String signature) {
		return new IndexReferenceRecordComponentVisitor(api, new Entry.Field(this.name, name, descriptor));
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
		public AnnotationVisitor visitAnnotationDefault() {
			return new IndexAnnotationVisitor(callerId);
		}

		@Override
		public AnnotationVisitor visitAnnotation(String descriptor, boolean visible) {
			return indexAnnotation(callerId, descriptor);
		}

		@Override
		public AnnotationVisitor visitParameterAnnotation(int parameter, String descriptor, boolean visible) {
			return indexAnnotation(callerId, descriptor);
		}

		@Override
		public AnnotationVisitor visitTypeAnnotation(int typeRef, TypePath typePath, String descriptor, boolean visible) {
			return indexAnnotation(callerId, descriptor);
		}

		@Override
		public AnnotationVisitor visitInsnAnnotation(int typeRef, TypePath typePath, String descriptor, boolean visible) {
			return indexAnnotation(callerId, descriptor);
		}

		@Override
		public AnnotationVisitor visitLocalVariableAnnotation(int typeRef, TypePath typePath, Label[] start, Label[] end, int[] index, String descriptor, boolean visible) {
			return indexAnnotation(callerId, descriptor);
		}

		@Override
		public AnnotationVisitor visitTryCatchAnnotation(int typeRef, TypePath typePath, String descriptor, boolean visible) {
			return indexAnnotation(callerId, descriptor);
		}

		@Override
		public void visitFieldInsn(int opcode, String owner, String name, String descriptor) {
			switch (opcode) {
			case Opcodes.GETSTATIC, Opcodes.PUTSTATIC, Opcodes.GETFIELD, Opcodes.PUTFIELD -> {
				if (Indexer.isReferenceTarget(owner)) {
					indexFieldReference(callerId, new Entry.Field(owner, name, descriptor));
                    if (opcode == Opcodes.GETSTATIC || opcode == Opcodes.PUTSTATIC) {
                        indexStaticOwnerReference(callerId, owner);
                    }
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
                if (opcode == Opcodes.INVOKESTATIC) {
                    indexStaticOwnerReference(callerId, owner);
                }
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

                    if (implMethod.getTag() == Opcodes.H_INVOKESTATIC) {
                        indexStaticOwnerReference(callerId, implMethod.getOwner());
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

    private void indexStaticOwnerReference(int callerId, String owner) {
        if (!owner.equals(name)) {
            indexer.addReference(owner, callerId);
        }
    }

	private AnnotationVisitor indexAnnotation(int callerId, String descriptor) {
		indexMethodType(callerId, Type.getType(descriptor));
		return new IndexAnnotationVisitor(callerId);
	}

	private class IndexAnnotationVisitor extends AnnotationVisitor {
		private final int callerId;

		IndexAnnotationVisitor(int callerId) {
			super(ClassIndexVisitor.this.api);
			this.callerId = callerId;
		}

		@Override
		public void visit(String name, Object value) {
			if (value instanceof Type type) {
				indexMethodType(callerId, type);
			}
		}

		@Override
		public void visitEnum(String name, String descriptor, String value) {
			Type type = Type.getType(descriptor);
			indexMethodType(callerId, type);
			indexFieldReference(callerId, new Entry.Field(type.getInternalName(), value, descriptor));
		}

		@Override
		public AnnotationVisitor visitAnnotation(String name, String descriptor) {
			return indexAnnotation(callerId, descriptor);
		}

		@Override
		public AnnotationVisitor visitArray(String name) {
			return this;
		}
	}

	private class IndexReferenceRecordComponentVisitor extends RecordComponentVisitor {
		private final Entry.Field field;

		IndexReferenceRecordComponentVisitor(int api, Entry.Field field) {
			super(api);
			this.field = field;
		}

		@Override
		public AnnotationVisitor visitAnnotation(String descriptor, boolean visible) {
			return indexAnnotation(indexer.referenceId(field), descriptor);
		}

		@Override
		public AnnotationVisitor visitTypeAnnotation(int typeRef, TypePath typePath, String descriptor, boolean visible) {
			return indexAnnotation(indexer.referenceId(field), descriptor);
		}

	}

	private class IndexReferenceFieldVisitor extends FieldVisitor {
		private final Entry.Field field;

		IndexReferenceFieldVisitor(int api, Entry.Field field) {
			super(api);
			this.field = field;
		}

		@Override
		public AnnotationVisitor visitAnnotation(String descriptor, boolean visible) {
			return indexAnnotation(indexer.referenceId(field), descriptor);
		}

		@Override
		public AnnotationVisitor visitTypeAnnotation(int typeRef, TypePath typePath, String descriptor, boolean visible) {
			return indexAnnotation(indexer.referenceId(field), descriptor);
		}
	}
}
