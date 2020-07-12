package src.LeetCode;

/**
 * LeetCode-21:合并
 *
 * @author Ryan
 * @date 2020/7/11
 */
public class MergeTwoSortedLists {
    public ListNode mergeTwoLists(ListNode l1, ListNode l2) {
        ListNode trav1 = l1;
        ListNode trav2 = l2;
        ListNode dummy = new ListNode(0);
        ListNode curr = dummy;
        while (trav1 != null || trav2 != null) {
            if (trav1 != null && trav2 != null) {
                if (trav1.val <= trav2.val) {
                    curr.next = trav1;
                } else {
                    curr.next = trav2;
                }
            } else if (trav1 != null) {
                curr.next = trav1;
            } else if (trav2 != null) {
                curr.next = trav2;
            }

            if (curr.next == trav1) {
                trav1 = trav1.next;
            } else if (curr.next == trav2) {
                trav2 = trav2.next;
            }

            curr = curr.next;
        }

        return dummy.next;
    }

    static class ListNode {
        int val;
        ListNode next;

        ListNode() {
        }

        ListNode(int val) {
            this.val = val;
        }

        ListNode(int val, ListNode next) {
            this.val = val;
            this.next = next;
        }
    }
}