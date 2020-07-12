# Java源代碼分析 - Queue

## 簡介
`Queue`在Java裡被定義為一個介面，主要提供以下方法:

|  | 會拋例外 | 回傳特別值 |
| -------- | -------- | -------- |
| 插入     | `add(e)`     | `offer(e)`     |
| 刪除     | `remove()`     | `poll()`     |
| 查看     | `element()`     | `peek()`    |

`Queue`主要以**先入先出**的方式排序元素，但也有一些例外，例如`PriorityQueue`就是按照元素的優先級別排序。

## 特性
* `Queue`並不實作**blocking queue methods**，如果要限制多線程的存取必須使用`BlockingQueue`這個類別
* `Queue`不建議插入`null`(大部分情況也不被允許)，就算是使用`LinkedList`等允許插入`null`的類別，也不建議插入`null`，因為`null`經常被拿來當作排序的屬性使用。