package mcsrc;

public sealed interface Entry permits Entry.Class, Entry.Member, Entry.Field, Entry.Method {
    String reference();

    record Class(String name) implements Entry {
        @Override
        public String reference() {
            return "s:%s".formatted(name);
        }
    }

    sealed interface Member extends Entry permits Field, Method {
    }

    record Field(String owner, String name, String desc) implements Member, Entry {
        public String str() {
            return "%s:%s:%s".formatted(owner, name, desc);
        }

        @Override
        public String reference() {
            return "f:%s:%s:%s".formatted(owner, name, desc);
        }
    }

    record Method(String owner, String name, String desc) implements Member, Entry {
        public String str() {
            return "%s:%s:%s".formatted(owner, name, desc);
        }

        @Override
        public String reference() {
            return "m:%s:%s:%s".formatted(owner, name, desc);
        }
    }
}
