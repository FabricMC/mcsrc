package net.minecraft;

public class NavigationChild extends NavigationParent<String> {
    @Override
    public String value(String input) {
        return input;
    }

    public String value(int input) {
        return Integer.toString(input);
    }

    @Override
    public Integer count() {
        return 2;
    }

    public static void hidden() {
    }

    public static class Nested extends NavigationParent<String> {
        @Override
        public String value(String input) {
            return input;
        }
    }
}
