# Java源代碼分析 - HashMap

## 特性
* 允許`null`鍵值
* 非線程安全
* 不保證插入順序
* 影響效能有兩個因素: `capacity`(容量)及`load factor`(負載因子)。當`HashMap`裡的值大於`current capacity` * `load factor`時，`HashMap`將會重組內部資料結構(`rehash`)。
* 預設的`load factor`設在`0.75`

## 建構子
預設
```java=
public HashMap() {
    this.loadFactor = DEFAULT_LOAD_FACTOR; // 裝載因子預設為0.75
}
```
自定義初始容量及裝載因子
```java=
public HashMap(int initialCapacity, float loadFactor) {
    if (initialCapacity < 0)
        throw new IllegalArgumentException("Illegal initial capacity: " +
                                           initialCapacity);
    if (initialCapacity > MAXIMUM_CAPACITY)
        initialCapacity = MAXIMUM_CAPACITY;
    if (loadFactor <= 0 || Float.isNaN(loadFactor))
        throw new IllegalArgumentException("Illegal load factor: " +
                                           loadFactor);
    this.loadFactor = loadFactor;
    this.threshold = tableSizeFor(initialCapacity);
}
```

## `Put`方法
用`Linked list`的方式來處理碰撞，當hash後的索引已有值時，新的node會直接接到該索引的鏈表。
```java=
public V put(K key, V value) {
    return putVal(hash(key), key, value, false, true);
}
```
主要邏輯在`putVal`中
```java=
/**
 * Implements Map.put and related methods.
 *
 * @param hash hash for key
 * @param key the key
 * @param value the value to put
 * @param onlyIfAbsent if true, don't change existing value
 * @param evict if false, the table is in creation mode.
 * @return previous value, or null if none
 */
final V putVal(int hash, K key, V value, boolean onlyIfAbsent,
               boolean evict) {
    Node<K,V>[] tab; Node<K,V> p; int n, i;
    if ((tab = table) == null || (n = tab.length) == 0)
        // 第一次調用，初始化table及threshhold
        n = (tab = resize()).length;
    if ((p = tab[i = (n - 1) & hash]) == null)
        // 對應的索引沒有Node，直接新建Node放入table
        tab[i] = newNode(hash, key, value, null);
    else {
        Node<K,V> e; K k;
        // hash值相等，而且key也相等，則更新對應Node的value
        if (p.hash == hash &&
            ((k = p.key) == key || (key != null && key.equals(k))))
            e = p;
        else if (p instanceof TreeNode)
            e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
        else {
        // hash值相等，但是key不一樣，就將key-value添加到已有的Node的最後面
            for (int binCount = 0; ; ++binCount) {
                if ((e = p.next) == null) {
                    p.next = newNode(hash, key, value, null);
                    if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
                        treeifyBin(tab, hash);
                    break;
                }
                if (e.hash == hash &&
                    ((k = e.key) == key || (key != null && key.equals(k))))
                    break;
                p = e;
            }
        }
        if (e != null) { // existing mapping for key
            V oldValue = e.value;
            if (!onlyIfAbsent || oldValue == null)
                e.value = value;
            afterNodeAccess(e);
            return oldValue;
        }
    }
    ++modCount;
    if (++size > threshold)
        resize();
    afterNodeInsertion(evict);
    return null;
}
```

## Get
計算key的hash值，如果不存在該key則回傳`null`
```java=
public V get(Object key) {
    Node<K,V> e;
    return (e = getNode(hash(key), key)) == null ? null : e.value;
}
```
```java=
/**
 * Implements Map.get and related methods
 *
 * @param key 的hash值
 * @param key的值
 * @return 返回由key和hash定位的Node，或者null
 */
final Node<K,V> getNode(int hash, Object key) {
    Node<K,V>[] tab; Node<K,V> first, e; int n; K k;
    if ((tab = table) != null && (n = tab.length) > 0 &&
        (first = tab[(n - 1) & hash]) != null) {
        // 如果索引的第一個Node，key及hash值都相等，則返回該Node
        if (first.hash == hash &&
            ((k = first.key) == key || (key != null && key.equals(k))))
            return first;
        // 如果索引到的第一個Node不符合條件，則往下一個節點找
        if ((e = first.next) != null) { 
            if (first instanceof TreeNode)
                return ((TreeNode<K,V>)first).getTreeNode(hash, key);
            do {
                if (e.hash == hash &&
                    ((k = e.key) == key || (key != null && key.equals(k))))
                    return e;
            } while ((e = e.next) != null);
        }
    }
    return null;
}
```

###### tags: `算法訓練營`