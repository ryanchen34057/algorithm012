# Java 源代碼分析 - PriorityQueue

## 簡介
`PriorityQueue`實作`Queue<T>`這個介面，跟`Queue`比較不同的是，容器裡的元素是按照每個元素的優先級(實作`Comparator`)來排序的。

- 頭元素為重要度最低的
  `peek`, `poll`, `remove`, `element`等操作都會去從頭元素開始存取
- 底層用**堆(heap)**的概念實現，容器為數組，數組裡元素的重要度可以依照元素的**Natural ordering**(例如數字的大小)，或是實作`Comparator`，在建構的時候就可以帶入如下:

```java
public PriorityQueue(Comparator<? super E> comparator) {
        this(DEFAULT_INITIAL_CAPACITY, comparator);
}
```

## 時間複雜度

- 插入(`offer`, `add`)及刪除(`poll`, `remove`)為**O(log n)**
- 查看(`peek`, `element`)為 O(1)

## 方法

- `Offer`
  新增新的元素

```java
public boolean offer(E e) {
    if (e == null)
        throw new NullPointerException();
    modCount++;
    int i = size;
    if (i >= queue.length) // 如果數組已滿，就要進行擴容
        grow(i + 1);
    size = i + 1; // 增加大小
    if (i == 0)
        queue[0] = e; // 數組為空，直接加入頭
    else
        // 這裡面做的事情就是不斷讓重要度最小的元素浮上頭
        siftUp(i, e);
    return true;
}
```

- `Peek`
  沒甚麼特別的，就是回傳頭元素，但不刪除。

```java
public E peek() {
    return (size == 0) ? null : (E) queue[0];
}
```

- `Remove`
  刪除某個 index 的元素

```java
public boolean remove(Object o) {
    // 找出元素所在的index
    int i = indexOf(o);
    if (i == -1)
        return false;
    else {
        removeAt(i);
        return true;
    }
}
```

- `Poll`
  刪除頭元素(重要度最低)

```java
public E poll() {
    if (size == 0)
        return null;
    int s = --size;
    modCount++;
    E result = (E) queue[0];
    E x = (E) queue[s];
    queue[s] = null;
    if (s != 0)
        // 把元素重新移上來
        siftDown(0, x);
    return result;
}
```
