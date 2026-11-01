import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Lightweight JSON formatting and simple request body parsing utility
 * with zero third-party dependencies.
 */
public class JsonUtil {

    public static String escape(String s) {
        if (s == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (ch <= '\u001F') {
                        sb.append(String.format("\\u%04x", (int) ch));
                    } else {
                        sb.append(ch);
                    }
                }
            }
        }
        return sb.toString();
    }

    /**
     * Parses either standard URL-encoded form data or a simple JSON object
     * into a key-value Map.
     */
    public static Map<String, String> parseBody(String body) {
        Map<String, String> map = new HashMap<>();
        if (body == null || body.trim().isEmpty()) {
            return map;
        }

        String trimmed = body.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            // Simple JSON parser for single-level key-values
            String content = trimmed.substring(1, trimmed.length() - 1);
            boolean inQuotes = false;
            StringBuilder current = new StringBuilder();
            for (int i = 0; i < content.length(); i++) {
                char c = content.charAt(i);
                if (c == '"' && (i == 0 || content.charAt(i - 1) != '\\')) {
                    inQuotes = !inQuotes;
                    current.append(c);
                } else if (c == ',' && !inQuotes) {
                    processJsonPair(current.toString(), map);
                    current.setLength(0);
                } else {
                    current.append(c);
                }
            }
            if (current.length() > 0) {
                processJsonPair(current.toString(), map);
            }
        } else {
            // URL-encoded form parser
            String[] pairs = trimmed.split("&");
            for (String pair : pairs) {
                int idx = pair.indexOf("=");
                if (idx > 0) {
                    String key = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
                    String val = idx < pair.length() - 1
                            ? URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8)
                            : "";
                    map.put(key, val);
                }
            }
        }

        return map;
    }

    private static void processJsonPair(String pair, Map<String, String> map) {
        int colon = pair.indexOf(':');
        if (colon > 0) {
            String key = unquote(pair.substring(0, colon).trim());
            String val = unquote(pair.substring(colon + 1).trim());
            map.put(key, val);
        }
    }

    private static String unquote(String s) {
        if (s == null) return "";
        s = s.trim();
        if (s.startsWith("\"") && s.endsWith("\"") && s.length() >= 2) {
            s = s.substring(1, s.length() - 1);
        }
        return s.replace("\\\"", "\"").replace("\\\\", "\\").replace("\\n", "\n");
    }
}
