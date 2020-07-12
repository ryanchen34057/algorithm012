package src.LeetCode;

import java.util.HashMap;
import java.util.Map;

/**
 * LeetCode-1: 两数之和
 *
 * @author Ryan
 * @date 2020/7/10
 */
public class TwoSum {

    /**
     * Use hash
     * 
     * @param nums
     * @param target
     * @return int[]
     */
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<Integer, Integer>();
        for (int i = 0; i < nums.length; map.put(nums[i], i++)) {
            if (map.containsKey(target - nums[i])) {
                return new int[] { map.get(target - nums[i]), i };
            }
        }

        return new int[] { 0, 0 };
    }
}