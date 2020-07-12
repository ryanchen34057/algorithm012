public class MyCircularDeque {
    private Node head;
    private Node tail;
    private final int maxSize;
    private int size;

    /** Initialize your data structure here. Set the size of the deque to be k. */
    public MyCircularDeque(final int k) {
        size = 0;
        maxSize = k;
        head = tail = null;
    }

    /**
     * Adds an item at the front of Deque. Return true if the operation is
     * successful.
     */
    public boolean insertFront(final int value) {
        if (isFull())
            return false;
        Node newNode = new Node(value);
        newNode.next = head;

        if (head != null) {
            head.prev = newNode;
        }
        head = newNode;
        if (tail == null) {
            tail = newNode;
        }
        
        size++;
        return true;
    }

    /**
     * Adds an item at the rear of Deque. Return true if the operation is
     * successful.
     */
    public boolean insertLast(int value) {
        if (isFull())
            return false;
        Node newNode = new Node(value);
        newNode.prev = tail;

        if (tail != null) {
            tail.next = newNode;
        }
        tail = newNode;
        if (head == null) {
            head = newNode;
        }
        size++;
        return true;
    }

    /**
     * Deletes an item from the front of Deque. Return true if the operation is
     * successful.
     */
    public boolean deleteFront() {
        if (isEmpty())
            return false;
        if (size == 1) {
            head = tail = null;
            size = 0;
            return true;
        }
        head = head.next;
        size--;
        return true;
    }

    /**
     * Deletes an item from the rear of Deque. Return true if the operation is
     * successful.
     */
    public boolean deleteLast() {
        if (isEmpty())
            return false;
        if (size == 1) {
            head = tail = null;
            size = 0;
            return true;
        }
        tail = tail.prev;
        size--;
        return true;
    }

    /** Get the front item from the deque. */
    public int getFront() {
        if (!isEmpty()) {
            return head.val;
        }
        return -1;
    }

    /** Get the last item from the deque. */
    public int getRear() {
        if (!isEmpty()) {
            return tail.val;
        }
        return -1;
    }

    /** Checks whether the circular deque is empty or not. */
    public boolean isEmpty() {
        return size == 0;
    }

    /** Checks whether the circular deque is full or not. */
    public boolean isFull() {
        return size == maxSize;
    }

    private class Node {
        private final int val;
        public Node prev;
        public Node next;

        public Node(final int val) {
            this.val = val;
        }
    }
}