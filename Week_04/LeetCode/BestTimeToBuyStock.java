package Week_04.LeetCode;

public class BestTimeToBuyStock {
    public int maxProfit(int[] prices) {
        if (prices.length < 2) {
            return 0;
        }

        int ans = 0;
        for (int i = 0; i < prices.length - 1; i++) {
            if (prices[i + 1] > prices[i]) {
                ans += prices[i + 1] - prices[i];
            }
        }

        return ans;
    }
}