package Week_02.LeetCode;

import java.util.HashMap;
import java.util.Map;
import java.util.PriorityQueue;

public class TopKFrequentElement {
    public int[] topKFrequent(int[] nums, int k) {
        if (nums == null || nums.length == 0) {
            return new int[0];
        }
        Map<Integer, Integer> map = new HashMap<>();
        for (int num : nums) {
            map.put(num, map.getOrDefault(num, 0) + 1);
        }

        int[] ans = new int[k];
        PriorityQueue<Integer> heap = new PriorityQueue<Integer>((n1, n2) -> Integer.compare(map.get(n2), map.get(n1)));

        for (int count : map.keySet()) {
            heap.add(count);
        }

        for (int i = 0; i < k; i++) {
            ans[i] = heap.poll();
        }
        return ans;
    }
}