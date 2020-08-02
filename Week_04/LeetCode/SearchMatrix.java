package Week_04.LeetCode;

public class SearchMatrix {
    public boolean searchMatrix(int[][] matrix, int target) {
        if (matrix == null || matrix.length == 0 || matrix[0].length == 0) {
            return false;
        }
        int length = matrix.length;
        int left = 0;
        int right = length - 1;
        while (left <= right) {
            int min = (left + right) / 2;
            if (target >= matrix[min][0] && target <= matrix[min][matrix[min].length - 1]) {
                return binarySearch(matrix[min], target);
            }
            if (target < matrix[min][0]) {
                right = min - 1;
            } else {
                left = min + 1;
            }
        }
        return false;
    }

    private boolean binarySearch(int[] row, int target) {
        int left = 0;
        int right = row.length - 1;
        while (left <= right) {
            int min = (left + right) / 2;
            if (row[min] == target) {
                return true;
            }
            if (target <= row[min]) {
                right = min - 1;
            } else {
                left = min + 1;
            }
        }
        return false;
    }
}