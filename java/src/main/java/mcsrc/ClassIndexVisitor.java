package mcsrc;

import org.objectweb.asm.AnnotationVisitor;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.FieldVisitor;
import org.objectweb.asm.Handle;
import org.objectweb.asm.Label;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;

// Based on code from Enigma
final class ClassIndexVisitor extends ClassVisitor {
	private final Indexer indexer;
	private String name;
    private boolean isEnum;

	ClassIndexVisitor(Indexer indexer) {
		super(Opcodes.ASM9);
		this.indexer = indexer;
    }

	@Override
	public void visit(int version, int access, String name, String signature, String superName, String[] interfaces) {
		this.name = name;
		this.isEnum = (access & Opcodes.ACC_ENUM) != 0;
		indexer.addClass(name, superName, interfaces, access);
	}

	@Override
	public AnnotationVisitor visitAnnotation(String descriptor, boolean visible) {
		return indexAnnotationValues(super.visitAnnotation(descriptor, visible), new Entry.Class(name));
	}

	@Override
	public FieldVisitor visitField(int access, String name, String desc, String signature, Object value) {
		Entry.Field field = new Entry.Field(this.name, name, desc);
		indexField(field);
		if (value instanceof String string) {
			indexer.addString(field, string);
		}
		return new FieldVisitor(api, null) {
			@Override
			public AnnotationVisitor visitAnnotation(String annotationDescriptor, boolean visible) {
				return indexAnnotationValues(super.visitAnnotation(annotationDescriptor, visible), field);
			}
		};
	}

	@Override
	public MethodVisitor visitMethod(int access, String name, String desc, String signature, String[] exceptions) {
		Entry.Method method = indexer.addMethod(new Entry.Method(this.name, name, desc), access);
		int callerId = indexer.referenceId(method);
		indexMethodDescriptor(callerId, method.desc());
		IndexReferenceMethodVisitor visitor = new IndexReferenceMethodVisitor(api, method, callerId, access);
		if (isEnum && name.equals("<clinit>")) {
			// Wrap the visitor to ignore enum constant names in the static initializer
			return new EnumInitializerVisitor(api, visitor);
		}
		return visitor;
	}

	private class EnumInitializerVisitor extends MethodVisitor {
		// 0 = no match
		// 1 = saw NEW for this enum class
		// 2 = saw NEW, then DUP
		private int enumInitState = 0;

		private EnumInitializerVisitor(int api, MethodVisitor methodVisitor) {
			super(api, methodVisitor);
		}

		@Override
		public void visitTypeInsn(int opcode, String type) {
		    enumInitState = opcode == Opcodes.NEW && ClassIndexVisitor.this.name.equals(type) ? 1 : 0;
		    super.visitTypeInsn(opcode, type);
		}

		@Override
		public void visitInsn(int opcode) {
		    enumInitState = enumInitState == 1 && opcode == Opcodes.DUP ? 2 : 0;
		    super.visitInsn(opcode);
		}

		@Override
		public void visitLdcInsn(Object value) {
			if (value instanceof String && enumInitState == 2) {
				enumInitState = 0;
				return;
			}
			super.visitLdcInsn(value);
		}

        @Override
        public void visitIntInsn(int opcode, int operand) {
			enumInitState = 0;
            super.visitIntInsn(opcode, operand);
        }

        @Override
        public void visitVarInsn(int opcode, int varIndex) {
			enumInitState = 0;
            super.visitVarInsn(opcode, varIndex);
        }

        @Override
        public void visitFieldInsn(int opcode, String owner, String name, String descriptor) {
            enumInitState = 0;
            super.visitFieldInsn(opcode, owner, name, descriptor);
        }

        @Override
        public void visitMethodInsn(int opcode, String owner, String name, String descriptor, boolean isInterface) {
            enumInitState = 0;
            super.visitMethodInsn(opcode, owner, name, descriptor, isInterface);
        }

        @Override
        public void visitInvokeDynamicInsn(String name, String descriptor, Handle bootstrapMethodHandle, Object... bootstrapMethodArguments) {
			enumInitState = 0;
            super.visitInvokeDynamicInsn(name, descriptor, bootstrapMethodHandle, bootstrapMethodArguments);
        }

        @Override
        public void visitJumpInsn(int opcode, Label label) {
            enumInitState = 0;
            super.visitJumpInsn(opcode, label);
        }

        @Override
        public void visitIincInsn(int varIndex, int increment) {
            enumInitState = 0;
            super.visitIincInsn(varIndex, increment);
        }

        @Override
        public void visitTableSwitchInsn(int min, int max, Label dflt, Label... labels) {
			enumInitState = 0;
            super.visitTableSwitchInsn(min, max, dflt, labels);
        }

        @Override
        public void visitLookupSwitchInsn(Label dflt, int[] keys, Label[] labels) {
            enumInitState = 0;
            super.visitLookupSwitchInsn(dflt, keys, labels);
        }

        @Override
        public void visitMultiANewArrayInsn(String descriptor, int numDimensions) {
            enumInitState = 0;
            super.visitMultiANewArrayInsn(descriptor, numDimensions);
        }
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
		public AnnotationVisitor visitAnnotation(String descriptor, boolean visible) {
			return indexAnnotationValues(super.visitAnnotation(descriptor, visible), callerEntry);
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
			if (value instanceof String string) {
				indexer.addString(callerEntry, string);
			}

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
			if ("java/lang/invoke/StringConcatFactory".equals(bootstrapMethodHandle.getOwner())
					&& "makeConcatWithConstants".equals(bootstrapMethodHandle.getName())) {
				indexStringConcat(callerEntry, bootstrapMethodArguments);
			}

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

		private void indexStringConcat(Entry.Method callerEntry, Object[] bootstrapMethodArguments) {
			if (bootstrapMethodArguments.length == 0 || !(bootstrapMethodArguments[0] instanceof String recipe)) {
				return;
			}

			indexer.addString(callerEntry, recipe);

			for (int i = 1; i < bootstrapMethodArguments.length; i++) {
				if (bootstrapMethodArguments[i] instanceof String string) {
					indexer.addString(callerEntry, string);
				}
			}
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

	private AnnotationVisitor indexAnnotationValues(AnnotationVisitor visitor, Entry entry) {
		return new AnnotationVisitor(api, visitor) {
			@Override
			public void visit(String name, Object value) {
				if (value instanceof String string) {
					indexer.addString(entry, string);
				}
				super.visit(name, value);
			}

			@Override
			public AnnotationVisitor visitArray(String name) {
				return indexAnnotationValues(super.visitArray(name), entry);
			}
		};
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
