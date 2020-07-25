package Week_03.LeetCode;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedList;

public class PermutationsII {
    public List<List<Integer>> permuteUnique(int[] nums) {
        List<List<Integer>> res = new ArrayList<List<Integer>>();
        if (nums == null || nums.length == 0)
            return res;
        Arrays.sort(nums);
        backtrack(nums, new boolean[nums.length], new LinkedList<Integer>(), res);

        return res;
    }

    private void backtrack(int[] nums, boolean[] visited, LinkedList<Integer> pre, List<List<Integer>> res) {
        if (pre.size() == nums.length) {
            res.add(new ArrayList<Integer>(pre));
            return;
        }

        for (int i = 0; i < nums.length; i++) {
            if (visited[i])
                continue;
            if (i > 0 && nums[i] == nums[i - 1] && visited[i - 1]) {
                break;
            }
            pre.add(nums[i]);
            visited[i] = true;
            backtrack(nums, visited, pre, res);
            pre.removeLast();
            visited[i] = false;
        }
    }
}