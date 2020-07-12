package src.LeetCode;

/**
 * LeetCode-189:旋转数组
 * <p>
 * 给定一个数组，将数组中的元素向右移动 k 个位置，其中 k 是非负数。
 *
 * @author Ryan
 * @date 2020/7/11
 */
public class RotateArray {

    /**
     * Brute force solution Time complexity: O(k * n) Space complexity: O(1)
     * 
     * @param nums
     * @param k
     */
    public void rotateBruteForce(int[] nums, int k) {
        k %= nums.length;
        int tmp, prev = 0;
        for (int i = 0; i < k; i++) {
            prev = nums[nums.length - 1];
            for (int j = 0; j < nums.length; j++) {
                tmp = nums[j];
                nums[j] = prev;
                prev = tmp;
            }
        }
    }

    /**
     * Cyclic replacement Time complexity: O(n) Space complexity: O(1)
     * 
     * @param nums
     * @param k
     */
    public static void rotateByCyclicReplacement(int[] nums, int k) {
        k %= nums.length;
        int count = 0, next = 0;
        for (int i = 0; count < nums.length; i++) {
            int current = i;
            int prev = nums[i];
            do {
                next = (current + k) % nums.length;
                int tmp = nums[next];
                nums[next] = prev;
                current = next;
                prev = tmp;
                count++;
            } while (i != next);
        }
    }

    /**
     * Reverse 3 times 
     * Time complexity: O(n) Space complexity: O(1)
     * 
     * @param nums
     * @param k
     */
    public void rotate(int[] nums, int k) {
        k %= nums.length;
        reverse(nums, 0, nums.length - 1);
        reverse(nums, 0, k - 1);
        reverse(nums, k, nums.length - 1);
    }

    private void reverse(int[] nums, int start, int end) {
        while (start < end) {
            int tmp = nums[start];
            nums[start] = nums[end];
            nums[end] = tmp;
            start++;
            end--;
        }
    }
}