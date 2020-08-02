### 用二分查找尋找半有序數組中間無序的地方思路

用兩個指針，左跟右。
每次都先檢查最中間的數是否開始為無序的，如果是就直接返回即可。
無序代表前面跟後面都比自己大或是小。
而移動左右指針的方式為，每次都看左右指針的數哪個比較大，比較大的表示我們要將範圍縮到那一側，答案也就在那側。
當左指針較大時，我們將右指針指向中間數左邊的位置，右指針較大時，我們將左指針指向中間數右邊的位置。

### 代碼

```java
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
```
