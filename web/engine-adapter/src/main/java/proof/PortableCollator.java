package proof;

import java.util.Locale;

/**
 * Approximation adapted from MMRocket Sim 80e8df4 (see README.md reuse ledger).
 * TeaVM has no java.text.Collator. This supports the proof's ASCII motor label;
 * locale-sensitive catalog ordering is untested and is not compatible by claim.
 */
public abstract class PortableCollator implements java.util.Comparator<Object> {

    public static final int PRIMARY = 0;
    public static final int SECONDARY = 1;
    public static final int TERTIARY = 2;
    public static final int IDENTICAL = 3;

    private static final PortableCollator INSTANCE = new PortableCollator() {
        @Override
        public int compare(String source, String target) {
            int c = source.compareToIgnoreCase(target);
            if (c != 0) {
                return c;
            }
            return source.compareTo(target);
        }
    };

    protected PortableCollator() {}

    public static PortableCollator getInstance() {
        return INSTANCE;
    }

    public static PortableCollator getInstance(Locale desiredLocale) {
        return INSTANCE;
    }

    public abstract int compare(String source, String target);

    @Override
    public int compare(Object o1, Object o2) {
        return compare((String) o1, (String) o2);
    }

    public void setStrength(int newStrength) {
        // Strength is fixed at the case-insensitive approximation.
    }

    public boolean equals(String source, String target) {
        return (compare(source, target) == 0);
    }
}
