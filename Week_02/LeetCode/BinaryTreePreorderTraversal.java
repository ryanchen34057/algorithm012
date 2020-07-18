package Week_02.LeetCode;

import java.util.ArrayList;
import java.util.List;

public class BinaryTreePreorderTraversal {
    public List<Integer> preorderTraversalRecursive(TreeNode root) {
        List<Integer> res = new ArrayList<>();
        helper(res, root);

        return res;
    }

    private void helper(List<Integer> res, TreeNode root) {
        if (root == null)
            return;
        res.add(root.val);
        helper(res, root.left);
        helper(res, root.right);
    }
}