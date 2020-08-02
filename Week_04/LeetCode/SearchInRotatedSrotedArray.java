package Week_04.LeetCode;

public class SearchInRotatedSrotedArray {
    public int search(int[] nums, int target) {
        if (nums == null || nums.length == 0)
            return -1;
        int minIndex = findMin(nums);
        if (target == nums[minIndex]) {
            return minIndex;
        }
        int length = nums.length;
        int left = (target <= nums[length - 1]) ? minIndex : 0;
        int right = (target > nums[length - 1]) ? minIndex : length - 1;
        while (left <= right) {
            int half = (left + right) / 2;
            if (nums[half] == target) {
                return half;
            }
            if (target > nums[half]) {
                left = half + 1;
            } else {
                right = half - 1;
            }
        }
        return -1;
    }

    public int findMin(int[] nums) {
        int left = 0;
        int right = nums.length - 1;
        while (left < right) {
            int half = (left + right) / 2;
            if (nums[half] > nums[right]) {
                left = half + 1;
            } else {
                right = half;
            }
        }
        return left;
    }
}