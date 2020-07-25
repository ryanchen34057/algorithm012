package Week_03.LeetCode;

import java.util.ArrayList;
import java.util.LinkedList;

public class Permutations {
    public List<List<Integer>> permute(int[] nums) {
        List<List<Integer>> res = new ArrayList<List<Integer>>();
        if (nums == null || nums.length == 0) {
            return res;
        }
        backtrack(nums, new LinkedList<Integer>(), res);

        return res;
    }

    private void backtrack(int[] nums, LinkedList<Integer> pre, List<List<Integer>> res) {
        if (pre.size() == nums.length) {
            res.add(new ArrayList<Integer>(pre));
            return;
        }

        for (int i = 0; i < nums.length; i++) {
            if (pre.contains(nums[i]))
                continue;
            pre.add(nums[i]);
            backtrack(nums, pre, res);
            pre.removeLast();
        }
    }
}