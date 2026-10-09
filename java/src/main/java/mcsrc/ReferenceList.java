package mcsrc;

import java.util.Arrays;

final class ReferenceList {
    private int[] ids = new int[4];
    private int size;
    private boolean compacted = true;

    void add(int id) {
        // References from a method arrive together, so repeated instructions
        // usually repeat the last caller without needing a hash set.
        if (size > 0 && ids[size - 1] == id) {
            return;
        }
        if (size == ids.length) {
            ids = Arrays.copyOf(ids, Math.max(4, size * 2));
        }
        ids[size] = id;
        size++;
        compacted = false;
    }

    int[] ids() {
        if (!compacted) {
            Arrays.sort(ids, 0, size);
            int uniqueCount = 0;
            for (int i = 0; i < size; i++) {
                if (uniqueCount == 0 || ids[i] != ids[uniqueCount - 1]) {
                    ids[uniqueCount] = ids[i];
                    uniqueCount++;
                }
            }
            ids = Arrays.copyOf(ids, uniqueCount);
            size = uniqueCount;
            compacted = true;
        }
        return ids;
    }
}
