# Premium Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add four polish improvements — dotted grid background, markdown export, focus mode, and warm accent colours.

**Architecture:** All changes are isolated — CSS variables, a new export function, a CSS-driven focus mode with a React toggle, and colour token updates. No new dependencies.

**Tech Stack:** React, TypeScript, Tailwind CSS, lucide-react.

---

### Task 1: Dotted grid background

**Files:**
- Modify: `src/index.css`

**Steps:**

Add to the `@layer base` body rule:

```css
body {
  @apply bg-background text-foreground;
  background-image: radial-gradient(circle, hsl(var(--foreground) / 0.06) 1px, transparent 1px);
  background-size: 24px 24px;
}
```

Commit: `feat: add subtle dotted grid background`

---

### Task 2: Warm accent colour tokens

**Files:**
- Modify: `src/index.css`

**Steps:**

In `:root` (light mode), replace:
```css
--accent: 270 60% 96%;
--accent-foreground: 270 50% 45%;
```
With:
```css
--accent: 35 60% 94%;
--accent-foreground: 30 75% 40%;
```

In `.dark`, replace:
```css
--accent: 270 40% 20%;
--accent-foreground: 270 60% 75%;
```
With:
```css
--accent: 35 25% 18%;
--accent-foreground: 40 70% 80%;
```

Commit: `feat: replace purple accent with warm amber`

---

### Task 3: Markdown export

**Files:**
- Modify: `src/components/WritingInterface.tsx`

**Steps:**

Add `saveAsMd` function after `saveAsTxt`:

```typescript
const saveAsMd = () => {
  const content = contentRef.current;
  if (!content.trim()) return;
  const lines = content.split('\n');
  const exported = lines.map((line, i) => {
    const type = getLineType(lines, i);
    if (type === 'divider') return '---';
    if (type === 'timer') return '';
    if (type === 'list-header') return '';
    if (type === 'list-item') {
      const struck = isLineStruck(line);
      const clean = getCleanLine(line);
      return struck ? `- [x] ${clean}` : `- [ ] ${clean}`;
    }
    return line;
  }).filter((line, i, arr) => {
    // collapse consecutive blank lines from stripped timer/list-header
    if (line === '' && arr[i - 1] === '') return false;
    return true;
  }).join('\n').trim();
  const blob = new Blob([exported], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ezwrite-${new Date().toISOString().split('T')[0]}.md`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
```

Add to dropdown after the PDF option:
```tsx
<DropdownMenuItem onClick={saveAsMd} className="cursor-pointer">Download as Markdown</DropdownMenuItem>
```

Commit: `feat: add markdown export`

---

### Task 4: Focus mode

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/WritingInterface.tsx`

**Steps:**

**index.css** — add focus mode styles:
```css
.focus-mode .ce-editor > div {
  opacity: 0.2;
  transition: opacity 0.15s;
}
.focus-mode .ce-editor > div[data-focused="true"] {
  opacity: 1;
}
```

**WritingInterface.tsx:**

1. Add import: `import { Focus } from 'lucide-react';` (add to existing lucide import line)

2. Add state: `const [focusMode, setFocusMode] = useState(false);`

3. Add `activeLine` ref: `const activeLineRef = useRef(0);`

4. In `handleInput` and `handleKeyDown`, after getting `info`, sync the active line:
```typescript
if (info) {
  activeLineRef.current = info.lineIndex;
  if (focusMode && editorRef.current) {
    editorRef.current.childNodes.forEach((node, i) => {
      (node as HTMLElement).dataset.focused = String(i === info.lineIndex);
    });
  }
}
```

5. Add focus mode class to the outer container div:
```tsx
className={`min-h-screen bg-background flex flex-col${focusMode ? ' focus-mode' : ''}`}
```

6. Add focus mode button to header, after the theme toggle:
```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={() => setFocusMode(f => !f)}
  className={focusMode ? 'text-accent-foreground' : 'text-muted-foreground hover:text-accent-foreground'}
>
  <Focus size={18} />
</Button>
```

Commit: `feat: add focus mode`
