package Week_03.LeetCode;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.Map;
import java.util.Queue;
import java.util.Set;

public class BinaryTreeCommonAncestor {
    public TreeNode lowestCommonAncestorRecursion(final TreeNode root, final TreeNode p, final TreeNode q) {
        if (root == null)
            return null;
        if (root.val == p.val || root.val == q.val)
            return root;

        final TreeNode leftReasearched = lowestCommonAncestorRecursion(root.left, p, q);
        final TreeNode rightResearched = lowestCommonAncestorRecursion(root.right, p, q);

        if (leftReasearched == null)
            return rightResearched;
        if (rightResearched == null)
            return leftReasearched;

        if (leftReasearched != null && rightResearched != null)
            return root;
        return null;
    }

    public TreeNode lowestCommonAncestorIteration(final TreeNode root, TreeNode p, TreeNode q) {
        Map<TreeNode, TreeNode> map = new HashMap<>();
        Queue<TreeNode> queue = new LinkedList<>();
        map.put(root, null);
        queue.add(root);
        while (!map.containsKey(p) || !map.containsKey(q)) {
            final TreeNode node = queue.poll();
            if (node != null) {
                map.put(node.left, node);
                map.put(node.right, node);
                queue.add(node.left);
                queue.add(node.right);
            }
        }
        Set<TreeNode> set = new HashSet<>();
        while (p != null) {
            set.add(p);
            p = map.get(p);
        }
        while (!set.contains(q)) {
            q = map.get(q);
        }
        return q;
    }
}