package Week_03.LeetCode;

import java.util.ArrayList;
import java.util.List;
import java.util.Stack;

public class Combinations {
    private void findCombinations(int n, int k, int begin, Stack<Integer> pre, List<List<Integer>> res) {
        if (pre.size() == k) {
            res.add(new ArrayList<Integer>(pre));
            return;
        }
        for (int i = begin; i <= n; i++) {
            pre.add(i);
            findCombinations(n, k, i + 1, pre, res);
            pre.pop();
        }
    }

    public List<List<Integer>> combine(int n, int k) {
        List<List<Integer>> res = new ArrayList<List<Integer>>();
        if (n <= 0 || k <= 0 || n < k) {
            return res;
        }
        findCombinations(n, k, 1, new Stack<Integer>(), res);
        return res;
    }
}