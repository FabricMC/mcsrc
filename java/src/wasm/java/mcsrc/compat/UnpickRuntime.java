package mcsrc.compat;

import java.math.BigInteger;
import java.util.HashSet;
import java.util.Set;
import java.util.logging.Level;

public final class UnpickRuntime {
    private UnpickRuntime() {
    }

    public static <T> Set<T> newKeySet() {
        return new HashSet<>();
    }

    public static void failTransformation(Level level, String message, Throwable cause) {
        System.err.println(level.getName() + ": " + message);
        cause.printStackTrace(System.err);
        throw new IllegalStateException(message + ": " + cause, cause);
    }

    public static int parseUnsignedInt(String value, int radix) {
        BigInteger number = parseUnsigned(value, radix, 32);
        return number.intValue();
    }

    public static long parseUnsignedLong(String value, int radix) {
        BigInteger number = parseUnsigned(value, radix, 64);
        return number.longValue();
    }

    private static BigInteger parseUnsigned(String value, int radix, int bits) {
        BigInteger number = new BigInteger(value, radix);

        if (value.startsWith("-") || number.bitLength() > bits) {
            throw new NumberFormatException("Unsigned value out of range: " + value);
        }

        return number;
    }
}
