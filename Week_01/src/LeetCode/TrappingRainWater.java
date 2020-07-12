public class TrappingRainWater {
    public int trapBruteForce(int[] height) {
        int ans = 0;
        for (int i = 1;i < height.length - 1;i++) {
            int leftMax = 0;
            int rightMax = 0;
            // find left max height bar
            for (int j = i;j >= 0;j--) {
                leftMax = Math.max(leftMax, height[j]);
            }
            // find right max height bar
            for (int j = i;j < height.length;j++) {
                rightMax = Math.max(rightMax, height[j]);
            }

            ans += Math.min(leftMax, rightMax) - height[i];
        }
        return ans;
    }

    public int trapDynamicProgramming(int[] height) {
        if (height.length == 0) return 0;
        int ans = 0;
        int size = height.length;
        int[] leftMax = new int[size];
        int[] rightMax = new int[size];

        // get all maxes from left
        leftMax[0] = height[0];
        for (int i = 1;i < size;i++) {
            leftMax[i] = Math.max(leftMax[i - 1], height[i]);
        }

        // get all maxes from right
        rightMax[size - 1] = height[size - 1];
        for (int j = size - 2;j >= 0;j--) {
            rightMax[j] = Math.max(rightMax[j + 1], height[j]);
        }

        for (int i = 1;i < size - 1;i++) {
            ans += Math.min(leftMax[i], rightMax[i]) - height[i];
        }

        return ans;
    }

    public int trapTwoPointers(int[] height) {
        if (height.length == 0 || height.length < 3) {
            return 0;
        }

        int ans = 0;
        int leftMax = 0;
        int rightMax = 0;
        int left = 0;
        int right = height.length - 1;
        while (left < right) {
            leftMax = Math.max(leftMax, height[left]);
            rightMax = Math.max(rightMax, height[right]);
            if (leftMax <= rightMax) {
                ans += leftMax - height[left++];
            }
            else {
                ans += rightMax - height[right--];
            }
        }

        return ans;
    }
}