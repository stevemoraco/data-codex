# Enhanced Syntax Highlighting

The Codex CLI now includes comprehensive syntax highlighting for a beautiful terminal experience! ✨

## 🎨 Features Added

### **1. Patch/Diff Highlighting**
- **Red lines** (`-`) for removed content
- **Blue lines** (`+`) for added content (per user request - blue instead of green!)
- **Yellow backgrounds** for hunk headers (`@@`)
- **Magenta backgrounds** for patch markers (`*** Begin Patch`)
- **Cyan backgrounds** for file operations (`Update File:`, `Create File:`)

### **2. Programming Language Support**
- **Python**: Keywords (`def`, `class`, `import`), strings, comments, functions
- **TypeScript/JavaScript**: Keywords (`function`, `const`, `let`), types, properties
- **Shell/Bash**: Commands, options, pipes, redirects
- **JSON/YAML**: Structure highlighting
- **CSS/SCSS**: Selectors, properties, values
- **HTML/XML**: Tags, attributes
- **SQL**: Keywords, functions

### **3. Smart Auto-Detection**
- File extension detection (`.py`, `.ts`, `.js`, `.sh`, etc.)
- Shebang detection (`#!/usr/bin/python`, `#!/bin/bash`)
- Content pattern detection
- Context-aware highlighting (patches vs code vs commands)

## 🚀 Integration Points

### **Command Output**
- `apply_patch` commands now show beautiful red/blue diffs
- Shell commands have syntax highlighting with operators and keywords
- Error messages and stack traces are easier to read

### **Code Blocks**
- Markdown code blocks (```language) are automatically highlighted
- Inline code detection and highlighting
- Multi-language support in conversations

### **Tool Calls**
- Shell commands in tool calls are highlighted
- Apply patch previews show enhanced diff visualization
- Function call arguments and responses

## 🎯 Color Scheme

### **Keywords & Syntax**
- **Blue bold**: Keywords (`def`, `function`, `class`, `import`)
- **Cyan bold**: Built-ins, functions, methods
- **Green bold**: Types, class names
- **Yellow bold**: Numbers, literals
- **Green**: Strings
- **Gray italic**: Comments
- **White bold**: Operators
- **Magenta bold**: Constants, literals

### **Patches & Diffs**
- **Red bold**: Removed lines (`-`)
- **Blue bold**: Added lines (`+`) 
- **Yellow background**: Hunk headers (`@@`)
- **Magenta background**: Patch markers
- **Cyan background**: File operations
- **Gray**: Context lines

## 🔧 Usage Examples

### **Automatic Detection**
```bash
# Shell commands are automatically highlighted
git status
npm run build
python -m pip install package
```

### **Language-Specific Highlighting**
```python
# Python code gets proper syntax highlighting
def hello_world(name: str) -> str:
    """Return a greeting message."""
    return f"Hello, {name}!"
```

```typescript
// TypeScript with type annotations
interface User {
  name: string;
  age: number;
}

const createUser = (data: User): User => {
  return { ...data };
};
```

### **Enhanced Patches**
```diff
*** Begin Patch
*** Update File: src/example.py
@@ -1,3 +1,3 @@
 def hello():
-    print("old message")
+    print("new message")
     return True
*** End Patch
```

## 💡 Benefits

1. **Better Readability**: Code and diffs are much easier to scan and understand
2. **Faster Code Review**: Red/blue patch highlighting makes changes obvious
3. **Language Recognition**: Automatically adapts to different programming languages
4. **Professional Appearance**: Makes the terminal output look polished and modern
5. **Reduced Eye Strain**: Proper color coding reduces cognitive load

## 🧪 Testing

To see the syntax highlighting in action:

1. **Start the CLI**: `npm start` or `./bin/codex`
2. **Run any command** that generates code output
3. **Use apply_patch** to see the enhanced diff visualization
4. **Ask for code examples** in Python/TypeScript to see language highlighting

The highlighting system gracefully falls back to plain text if any issues occur, ensuring reliability while providing enhanced visual experience when possible.

---

**Note**: The syntax highlighting uses the `cli-highlight` library with a custom color theme optimized for terminal readability and the specific user request for red/blue diff colors.