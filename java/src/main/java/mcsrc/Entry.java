package mcsrc;

public sealed interface Entry permits Entry.Class, Entry.Member, Entry.Field, Entry.Method {
    String reference();

    record Class(String name) implements Entry {
        @Override
        public String reference() {
            return "s:" + name;
        }
    }

    sealed interface Member extends Entry permits Field, Method {
    }

    record Field(String owner, String name, String desc) implements Member, Entry {
        public String str() {
            return owner + ":" + name + ":" + desc;
        }

        @Override
        public String reference() {
            return "f:" + str();
        }
    }

    record Method(String owner, String name, String desc) implements Member, Entry {
        public String str() {
            return owner + ":" + name + ":" + desc;
        }

        @Override
        public String reference() {
            return "m:" + str();
        }
    }
}
