package Week_02.LeetCode;

import java.util.PriorityQueue;
import java.util.Queue;

public class UglyNumber {
    private int[] uglyNumbers = { 2, 3, 5 };

    public int nthUglyNumber(int n) {
        Queue<Long> queue = new PriorityQueue<>();
        queue.add(1L);
        int count = 0;

        while (!queue.isEmpty()) {
            long cut = queue.poll();
            if (++count >= n) {
                return (int) cut;
            }

            for (int num : uglyNumbers) {
                if (!queue.contains(num * cut)) {
                    queue.add(num * cut);
                }
            }
        }
        return -1;
    }
}