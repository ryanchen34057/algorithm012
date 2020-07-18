package Week_02.LeetCode;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

public class NaryTreePreorderTraversal {
    public List<Integer> preorderRecursive(Node root) {
        List<Integer> res = new ArrayList<Integer>();
        helper(root, res);
        return res;
    }

    private void helper(Node root, List<Integer> res) {
        if (root == null)
            return;
        res.add(root.val);
        for (Node child : root.children) {
            helper(child, res);
        }
    }

    public List<Integer> preorderIterative(Node root) {
        List<Integer> res = new ArrayList<Integer>();

        if (root == null)
            return res;

        LinkedList<Node> stack = new LinkedList<Node>();
        stack.add(root);
        while (!stack.isEmpty()) {
            Node tmp = stack.pollLast();
            res.add(tmp.val);
            for (int i = tmp.children.size() - 1; i >= 0; i--) {
                stack.add(tmp.children.get(i));
            }

        }

        return res;
    }
}