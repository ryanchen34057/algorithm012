package Week_03.LeetCode;

public class ConstructTreeFromPreAndInOrder {
    public TreeNode buildTree(int[] preorder, int[] inorder) {
        Map<Integer, Integer> map = new HashMap<>();

        for (int i = 0; i < inorder.length; i++) {
            map.put(inorder[i], i);
        }
        return helper(preorder, inorder, 0, 0, inorder.length - 1, map);
    }

    private TreeNode helper(int[] preorder, int[] inorder, int preStart, int inStart, int inEnd,
            Map<Integer, Integer> map) {
        if (preStart >= preorder.length || inStart > inEnd)
            return null;

        TreeNode root = new TreeNode(preorder[preStart]);
        int rootIndex = map.get(preorder[preStart]);

        root.left = helper(preorder, inorder, preStart + 1, inStart, rootIndex - 1, map);
        root.right = helper(preorder, inorder, preStart + rootIndex - inStart + 1, rootIndex + 1, inEnd, map);

        return root;
    }
}