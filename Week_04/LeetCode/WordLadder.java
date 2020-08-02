package Week_04.LeetCode;

public class WordLadder {
    public int ladderLength(String beginWord, String endWord, List<String> wordList) {
        Set<String> wordSet = new HashSet<>(wordList);
        wordSet.remove(beginWord);
        Queue<String> queue = new LinkedList<>();
        queue.offer(beginWord);
        Set<String> visited = new HashSet<>();
        visited.add(beginWord);
        int step = 1;
        int wordLength = beginWord.length();
        while (!queue.isEmpty()) {
            int currentSize = queue.size();
            for (int i = 0; i < currentSize; i++) {
                String word = queue.poll();
                char[] charArray = word.toCharArray();

                for (int j = 0; j < wordLength; j++) {
                    char originChar = charArray[j];

                    for (char k = 'a'; k <= 'z'; k++) {
                        if (originChar == k) {
                            continue;
                        }

                        charArray[j] = k;
                        String nextWord = String.valueOf(charArray);
                        if (wordSet.contains(nextWord)) {
                            if (nextWord.equals(endWord)) {
                                return step + 1;
                            }
                            if (!visited.contains(nextWord)) {
                                queue.add(nextWord);
                                visited.add(nextWord);
                            }
                        }
                    }
                    charArray[j] = originChar;
                }
            }
            step++;
        }
        return 0;
    }
}