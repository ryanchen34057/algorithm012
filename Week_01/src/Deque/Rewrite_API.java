package src.Deque;

import java.util.Deque;
import java.util.LinkedList;

public class Rewrite_API {
    public static void main(final String[] args) {
        Deque<String> deque = new LinkedList<String>();

        deque.addLast("a");
        deque.addLast("b");
        deque.addLast("c");
        System.out.println(deque);

        final String str = deque.peek();
        System.out.println(str);
        System.out.println(deque);

        while (deque.size() > 0) {
            System.out.println(deque.pop());
        }
        System.out.println(deque);
    }
}
