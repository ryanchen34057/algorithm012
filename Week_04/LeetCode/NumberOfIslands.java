package Week_04.LeetCode;

public class NumberOfIslands {
    // 遍歷過的陸地標記為'2'，一直遍歷相鄰的土地到沒有土地為止。
    public int numIslands(char[][] grid) {
        int count = 0;
        for (int i = 0; i < grid.length; i++) {
            for (int j = 0; j < grid[0].length; j++) {
                if (grid[i][j] == '1') {
                    dfs(grid, i, j);
                    count++;
                }
            }
        }
        return count;
    }

    private void dfs(char[][] grid, int r, int c) {
        // base case
        if (!inArea(grid, r, c)) {
            return;
        }

        // if it's not land, return immediately
        if (grid[r][c] != '1') {
            return;
        }

        grid[r][c] = '2';

        // visit north, south, west, east
        dfs(grid, r - 1, c);
        dfs(grid, r + 1, c);
        dfs(grid, r, c - 1);
        dfs(grid, r, c + 1);
    }

    private boolean inArea(char[][] grid, int r, int c) {
        return 0 <= r && r < grid.length && 0 <= c && c < grid[0].length;
    }
}