package Week_04.LeetCode;

import java.util.HashMap;
import java.util.Map;

public class LemonadeChange {
    private int lemonadePrice = 5;
    private int[] billType = new int[] { 5, 10, 20 };

    public boolean lemonadeChange(int[] bills) {
        Map<Integer, Integer> balance = new HashMap<>();
        for (int bill : bills) {
            if (bill <= lemonadePrice) {
                balance.put(bill, balance.getOrDefault(bill, 0) + 1);
            } else {
                int tmp = bill;
                for (int i = billType.length - 1; i >= 0; i--) {
                    if (billType[i] >= tmp) {
                        continue;
                    }

                    while (tmp != 5 && tmp > billType[i] && balance.getOrDefault(billType[i], 0) > 0) {
                        tmp -= billType[i];
                        balance.put(billType[i], balance.get(billType[i]) - 1);
                    }
                }
                if (tmp > 5) {
                    return false;
                }
                balance.put(bill, balance.getOrDefault(bill, 0) + 1);
            }
        }
        return true;
    }
}