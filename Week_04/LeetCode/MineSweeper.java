package Week_04.LeetCode;

public class MineSweeper {
    public char[][] updateBoard(char[][] board, int[] click) {
        dfs(board, click[0], click[1]);
        return board;
    }

    private void dfs(char[][] board, int x, int y) {
        if (!inArea(board, x, y))
            return;

        if (board[x][y] == 'E') {
            board[x][y] = 'B';
            int mine = countMine(board, x, y);
            if (mine == 0) {
                for (int i = -1; i <= 1; i++) {
                    for (int j = -1; j <= 1; j++) {
                        dfs(board, x + i, y + j);
                    }
                }
            } else {
                board[x][y] = (char) (mine + '0');
            }
        } else if (board[x][y] == 'M') {
            board[x][y] = 'X';
        }
    }

    private boolean inArea(char[][] board, int x, int y) {
        return x >= 0 && x < board.length && y >= 0 && y < board[0].length;
    }

    private int countMine(char[][] board, int x, int y) {
        int count = 0;
        for (int i = -1; i <= 1; i++) {
            for (int j = -1; j <= 1; j++) {
                if (x + i < 0 || x + i > board.length - 1 || y + j < 0 || y + j > board[0].length - 1) {
                    continue;
                }

                if (board[x + i][y + j] == 'M') {
                    count++;
                }
            }
        }
        return count;
    }
}