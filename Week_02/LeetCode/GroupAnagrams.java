package Week_02.LeetCode;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class GroupAnagrams {
    public List<List<String>> groupAnagrams(String[] strs) {
        Map<String, List<String>> map = new HashMap<String, List<String>>();
        for (String s : strs) {
            String key = ConvertToKey(s);
            List<String> group = map.getOrDefault(key, new ArrayList<String>());
            group.add(s);
            map.put(key, group);
        }

        return new ArrayList<List<String>>(map.values());
    }

    private String ConvertToKey(String s) {
        char[] counter = new char[26];
        for (char c : s.toCharArray()) {
            counter[c - 'a']++;
        }
        return String.valueOf(counter);
    }
}