package proof;

/** MD5-only MessageDigest API bridge for catalog identity, following RFC 1321 section 3. */
public final class PortableDigest {
    private final java.io.ByteArrayOutputStream pending = new java.io.ByteArrayOutputStream();
    private PortableDigest() { }
    public void update(byte[] input) { pending.write(input, 0, input.length); }
    public byte[] digest() {
        byte[] input = pending.toByteArray(); pending.reset(); return calculate(input);
    }
    public static PortableDigest getInstance(String algorithm) {
        if (!"MD5".equals(algorithm)) throw new IllegalArgumentException("Unsupported digest: " + algorithm);
        return new PortableDigest();
    }
    private static final int[] SHIFT = {
        7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
        5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
        4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
        6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21
    };
    private static final int[] TABLE = {
        0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
        0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
        0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
        0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
        0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
        0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
        0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
        0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391
    };
    public byte[] digest(byte[] input) { update(input); return digest(); }
    private byte[] calculate(byte[] input) {
        int blocks = (input.length + 8) / 64 + 1;
        byte[] padded = new byte[blocks * 64];
        System.arraycopy(input, 0, padded, 0, input.length);
        padded[input.length] = (byte) 0x80;
        long bits = (long) input.length * 8;
        for (int i = 0; i < 8; i++) padded[padded.length - 8 + i] = (byte) (bits >>> (8 * i));
        int a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
        int[] words = new int[16];
        for (int offset = 0; offset < padded.length; offset += 64) {
            for (int j = 0; j < 16; j++) {
                words[j] = 0;
                for (int k = 0; k < 4; k++) words[j] |= (padded[offset + j * 4 + k] & 255) << (8 * k);
            }
            int a = a0, b = b0, c = c0, d = d0;
            for (int i = 0; i < 64; i++) {
                int f, g;
                if (i < 16) { f = (b & c) | (~b & d); g = i; }
                else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
                else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
                else { f = c ^ (b | ~d); g = (7 * i) % 16; }
                int previousD = d; d = c; c = b;
                b += Integer.rotateLeft(a + f + TABLE[i] + words[g], SHIFT[i]); a = previousD;
            }
            a0 += a; b0 += b; c0 += c; d0 += d;
        }
        byte[] result = new byte[16]; int[] state = { a0, b0, c0, d0 };
        for (int j = 0; j < 4; j++) for (int k = 0; k < 4; k++) result[j * 4 + k] = (byte) (state[j] >>> (8 * k));
        return result;
    }
    public static String vector(int length) {
        if (length < 0 || length > 4096) throw new IllegalArgumentException("Digest vector bound");
        byte[] bytes = new byte[length];
        for (int i = 0; i < length; i++) bytes[i] = (byte) i;
        return info.openrocket.core.util.TextUtil.hexString(getInstance("MD5").digest(bytes));
    }
}
