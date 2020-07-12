package src.LeetCode;

/**
 * leetCode-283: 给定一个数组 nums，编写一个函数将所有 0 移动到数组的末尾，同时保持非零元素的相对顺序。 Note: 1.
 * 必须在原数组上操作,不能拷贝额外的数组 2. 尽量减少操作次数
 *
 * @author Ryan
 * @date 2020/7/11
 */
public class MoveZeroes {
    public void moveZeroes(int[] nums) {
        int lastNonZeroFound = 0;
        for (int i = 0; i < nums.length; i++) {
            if (nums[i] != 0) {
                swap(nums, lastNonZeroFound++, i);
            }
        }
    }

    private void swap(int[] nums, int x, int y) {
        int tmp = nums[x];
        nums[x] = nums[y];
        nums[y] = tmp;
    }
}