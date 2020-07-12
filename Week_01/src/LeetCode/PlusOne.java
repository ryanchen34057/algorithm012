package src.LeetCode;

/**
 * LeetCode-66:加一 给定一个由整数组成的非空数组所表示的非负整数，在该数的基础上加一。
 *
 * 最高位数字存放在数组的首位， 数组中每个元素只存储单个数字。
 *
 * 你可以假设除了整数 0 之外，这个整数不会以零开头
 *
 * @author Ryan
 * @date 2020/7/11
 */
public class PlusOne {
    public int[] plusOne(int[] digits) {
        int carry = 1, sum = 0;
        for (int i = digits.length - 1; i >= 0; i--) {
            sum = digits[i] + carry;
            carry = sum / 10;
            digits[i] = sum % 10;
        }

        if (carry > 0) {
            int[] newArr = new int[digits.length + 1];
            newArr[0] = 1;
            return newArr;
        }
        return digits;
    }
}