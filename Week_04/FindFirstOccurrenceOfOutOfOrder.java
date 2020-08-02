package Week_04;

public class FindFirstOccurrenceOfOutOfOrder {
    public static int findFirstOccurrence(int[] arr) {
        int left = 0;
        int right = arr.length - 1;
        while (left < right) {
            int half = (left + right) / 2;
            if (half > 0 && half < arr.length - 1) {
                if ((arr[half - 1] < arr[half] && arr[half + 1] < arr[half])
                        || (arr[half - 1] > arr[half] && arr[half + 1] > arr[half])) {
                    return half;
                }
                if (arr[left] > arr[right]) {
                    right = half - 1;
                } else {
                    left = half + 1;
                }
            }
        }
        return -1;
    }

    public static void main(String[] args) {
        int res = findFirstOccurrence(new int[] { 4, 5, 6, 7, 0, 1, 2, 3 });
    }
}