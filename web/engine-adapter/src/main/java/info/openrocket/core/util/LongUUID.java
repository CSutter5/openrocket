package info.openrocket.core.util;

/**
 * UUID API bridge adapted from MMRocket Sim 80e8df4 (see README.md).
 * The TeaVM classpath remaps current core UUID references to this class.
 * Runtime-generated IDs remain random; this proof persists no generated IDs.
 * The used parse, formatting, equality and bit operations require broader UUID
 * conformance coverage before general import/edit support can rely on them.
 */
public final class LongUUID implements Comparable<LongUUID> {

    private final long mostSigBits;
    private final long leastSigBits;

    public LongUUID(long mostSigBits, long leastSigBits) {
        this.mostSigBits = mostSigBits;
        this.leastSigBits = leastSigBits;
    }

    /** Use TeaVM's supported random generator; never mint shared counter-based IDs. */
    public static LongUUID randomUUID() {
        return fromString(java.util.UUID.randomUUID().toString());
    }

    /** JDK-compatible parse of the 8-4-4-4-12 form. */
    public static LongUUID fromString(String name) {
        String[] components = name.split("-");
        if (components.length != 5) {
            throw new IllegalArgumentException("Invalid UUID string: " + name);
        }
        long mostSigBits = Long.parseLong(components[0], 16);
        mostSigBits <<= 16;
        mostSigBits |= Long.parseLong(components[1], 16);
        mostSigBits <<= 16;
        mostSigBits |= Long.parseLong(components[2], 16);
        long leastSigBits = Long.parseLong(components[3], 16);
        leastSigBits <<= 48;
        leastSigBits |= Long.parseLong(components[4], 16);
        return new LongUUID(mostSigBits, leastSigBits);
    }

    public long getMostSignificantBits() {
        return mostSigBits;
    }

    public long getLeastSignificantBits() {
        return leastSigBits;
    }

    /** JDK UUID.toString algorithm. */
    @Override
    public String toString() {
        return (digits(mostSigBits >> 32, 8) + "-"
                + digits(mostSigBits >> 16, 4) + "-"
                + digits(mostSigBits, 4) + "-"
                + digits(leastSigBits >> 48, 4) + "-"
                + digits(leastSigBits, 12));
    }

    private static String digits(long val, int digits) {
        long hi = 1L << (digits * 4);
        return Long.toHexString(hi | (val & (hi - 1))).substring(1);
    }

    /** JDK UUID.hashCode algorithm. */
    @Override
    public int hashCode() {
        long hilo = mostSigBits ^ leastSigBits;
        return ((int) (hilo >> 32)) ^ (int) hilo;
    }

    @Override
    public boolean equals(Object obj) {
        if (!(obj instanceof LongUUID)) {
            return false;
        }
        LongUUID id = (LongUUID) obj;
        return (mostSigBits == id.mostSigBits && leastSigBits == id.leastSigBits);
    }

    /** JDK UUID.compareTo algorithm (signed long comparison, most then least). */
    @Override
    public int compareTo(LongUUID val) {
        return (this.mostSigBits < val.mostSigBits ? -1
                : (this.mostSigBits > val.mostSigBits ? 1
                        : (this.leastSigBits < val.leastSigBits ? -1
                                : (this.leastSigBits > val.leastSigBits ? 1 : 0))));
    }
}
