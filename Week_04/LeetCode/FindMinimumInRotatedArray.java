package Week_04.LeetCode;

public class FindMinimumInRotatedArray {
    public int findMin(int[] nums) {
        int length = nums.length;
        int left = 0;
        int right = length - 1;
        while (left < right) {
            int min = (left + right) / 2;
            if (nums[min] > nums[right]) {
                left = min + 1;
            } else {
                right = min;
            }
        }
        return nums[left];
    }
}