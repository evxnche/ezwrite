# ezwrite Full Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Strip all Lovable boilerplate, unused dependencies, dead code, and orphaned assets from the ezwrite codebase, leaving only what the app actually uses.

**Architecture:** Single-page app — `main.tsx` renders `WritingInterface` directly inside `ThemeProvider` and `TooltipProvider`, with no router, no query client, no unused shadcn. Every file in the repo will correspond to something the app actually does.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (button, dialog, dropdown-menu, tooltip only), next-themes, jsPDF, lucide-react.

---

### Task 1: Delete dead asset files

**Files:**
- Delete: `src/assets/ezwrite-logo.png`
- Delete: `public/lovable-uploads/` (entire directory)
- Delete: `public/placeholder.svg`
- Delete: `src/App.css`

**Step 1: Delete the files**

```bash
rm "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src/assets/ezwrite-logo.png"
rm -rf "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/public/lovable-uploads"
rm "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/public/placeholder.svg"
rm "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src/App.css"
```

**Step 2: Verify no imports reference them**

```bash
grep -r "ezwrite-logo\|lovable-uploads\|placeholder.svg\|App.css" \
  /Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src
```
Expected: no output.

**Step 3: Commit**

```bash
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" add -A
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" commit -m "chore: remove dead asset files"
```

---

### Task 2: Replace README and fix index.html meta tags

**Files:**
- Rewrite: `README.md`
- Modify: `index.html`

**Step 1: Rewrite README.md**

Replace the entire contents with:

```markdown
# ezwrite

A minimal, distraction-free writing tool by Evan Cheriyan.

## Dev

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```
```

**Step 2: Fix index.html**

Remove the Lovable OG image and Twitter credits. The `<meta>` block should become:

```html
<meta property="og:title" content="ezwrite" />
<meta property="og:description" content="A minimal, distraction-free writing environment" />
<meta property="og:type" content="website" />

<meta name="twitter:card" content="summary" />
<meta name="author" content="Evan Cheriyan" />
```

Remove the lines:
- `<meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />`
- `<meta name="twitter:site" content="@lovable_dev" />`
- `<meta name="twitter:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />`

**Step 3: Commit**

```bash
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" add README.md index.html
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" commit -m "chore: replace Lovable README and fix meta tags"
```

---

### Task 3: Remove lovable-tagger from vite.config.ts

**Files:**
- Modify: `vite.config.ts`

**Step 1: Rewrite vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**Step 2: Commit**

```bash
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" add vite.config.ts
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" commit -m "chore: remove lovable-tagger from vite config"
```

---

### Task 4: Simplify App.tsx — remove router, query client, and toasters

**Files:**
- Rewrite: `src/App.tsx`

**Step 1: Rewrite App.tsx**

```typescript
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import WritingInterface from "./components/WritingInterface";

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <TooltipProvider>
      <WritingInterface />
    </TooltipProvider>
  </ThemeProvider>
);

export default App;
```

**Step 2: Commit**

```bash
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" add src/App.tsx
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" commit -m "chore: remove router, query client, and toasters from App"
```

---

### Task 5: Delete the pages/ directory and unused hooks

**Files:**
- Delete: `src/pages/Index.tsx`
- Delete: `src/pages/NotFound.tsx`
- Delete: `src/pages/` directory
- Delete: `src/hooks/use-mobile.tsx`
- Delete: `src/hooks/use-toast.ts`

**Step 1: Delete the files**

```bash
rm -rf "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src/pages"
rm "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src/hooks/use-mobile.tsx"
rm "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src/hooks/use-toast.ts"
```

After this, `src/hooks/` only contains nothing — if empty, delete it too:

```bash
rmdir "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src/hooks" 2>/dev/null || true
```

**Step 2: Verify nothing imports them**

```bash
grep -r "use-mobile\|use-toast\|pages/" \
  /Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src
```
Expected: no output.

**Step 3: Commit**

```bash
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" add -A
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" commit -m "chore: delete pages dir and unused hooks"
```

---

### Task 6: Remove dead export from writing-helpers.ts

**Files:**
- Modify: `src/components/writing-helpers.ts`

**Step 1: Delete the `getCurrentLineInfo` function**

Remove lines 150–193 (the entire `getCurrentLineInfo` export). It is never imported anywhere.

**Step 2: Verify**

```bash
grep -r "getCurrentLineInfo" \
  /Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src
```
Expected: no output.

**Step 3: Commit**

```bash
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" add src/components/writing-helpers.ts
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" commit -m "chore: remove dead getCurrentLineInfo export"
```

---

### Task 7: Remove unused Google Font imports from index.css

**Files:**
- Modify: `src/index.css`

**Step 1: Remove three unused @import lines**

Delete these three lines from the top of `index.css`:
```css
@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap");
```

Keep: Roboto, Libre Caslon Text, Roboto Mono (used in tailwind font stacks).

**Step 2: Remove the sidebar CSS variables block**

In the `:root` block, delete lines:
```css
--sidebar-background: 0 0% 98%;
--sidebar-foreground: 0 0% 9%;
--sidebar-primary: 20 90% 48%;
--sidebar-primary-foreground: 33 100% 96%;
--sidebar-accent: 0 0% 32%;
--sidebar-accent-foreground: 0 0% 98%;
--sidebar-border: 0 0% 83%;
--sidebar-ring: 20 90% 48%;
--sidebar: 0 0% 98%;
```

And in the `.dark` block, delete:
```css
--sidebar-background: 240 5.9% 10%;
--sidebar-foreground: 0 0% 98%;
--sidebar-primary: 27 95% 60%;
--sidebar-primary-foreground: 12 81% 14%;
--sidebar-accent: 43 96% 56%;
--sidebar-accent-foreground: 20 91% 14%;
--sidebar-border: 0 0% 32%;
--sidebar-ring: 27 95% 60%;
--sidebar: 0 0% 14%;
```

**Step 3: Commit**

```bash
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" add src/index.css
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" commit -m "chore: remove unused font imports and sidebar CSS vars"
```

---

### Task 8: Delete all unused shadcn/ui components

**Files to delete** (everything in `src/components/ui/` except `button.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`):

```
accordion.tsx, alert-dialog.tsx, alert.tsx, aspect-ratio.tsx, avatar.tsx,
badge.tsx, breadcrumb.tsx, calendar.tsx, card.tsx, carousel.tsx, chart.tsx,
checkbox.tsx, collapsible.tsx, command.tsx, context-menu.tsx, drawer.tsx,
form.tsx, hover-card.tsx, input-otp.tsx, input.tsx, label.tsx, menubar.tsx,
navigation-menu.tsx, pagination.tsx, popover.tsx, progress.tsx, radio-group.tsx,
resizable.tsx, scroll-area.tsx, select.tsx, separator.tsx, sheet.tsx, sidebar.tsx,
skeleton.tsx, slider.tsx, sonner.tsx, switch.tsx, table.tsx, tabs.tsx,
textarea.tsx, toast.tsx, toaster.tsx, toggle-group.tsx, toggle.tsx,
use-toast.ts
```

**Step 1: Delete them**

```bash
cd "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src/components/ui"
rm accordion.tsx alert-dialog.tsx alert.tsx aspect-ratio.tsx avatar.tsx \
   badge.tsx breadcrumb.tsx calendar.tsx card.tsx carousel.tsx chart.tsx \
   checkbox.tsx collapsible.tsx command.tsx context-menu.tsx drawer.tsx \
   form.tsx hover-card.tsx input-otp.tsx input.tsx label.tsx menubar.tsx \
   navigation-menu.tsx pagination.tsx popover.tsx progress.tsx radio-group.tsx \
   resizable.tsx scroll-area.tsx select.tsx separator.tsx sheet.tsx sidebar.tsx \
   skeleton.tsx slider.tsx sonner.tsx switch.tsx table.tsx tabs.tsx \
   textarea.tsx toast.tsx toaster.tsx toggle-group.tsx toggle.tsx use-toast.ts
```

**Step 2: Verify no remaining imports of deleted components**

```bash
grep -r "from '@/components/ui/" \
  /Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src
```

Expected output should only reference `button`, `dialog`, `dropdown-menu`, `tooltip`.

**Step 3: Commit**

```bash
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" add -A
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" commit -m "chore: delete unused shadcn components"
```

---

### Task 9: Slim down package.json and reinstall

**Files:**
- Modify: `package.json`

**Step 1: Replace package.json**

```json
{
  "name": "ezwrite",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.1",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "jspdf": "^3.0.1",
    "lucide-react": "^0.462.0",
    "next-themes": "^0.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwind-merge": "^2.5.2",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@eslint/js": "^9.9.0",
    "@tailwindcss/typography": "^0.5.15",
    "@types/node": "^22.5.5",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react-swc": "^3.5.0",
    "autoprefixer": "^10.4.20",
    "eslint": "^9.9.0",
    "eslint-plugin-react-hooks": "^5.1.0-rc.0",
    "eslint-plugin-react-refresh": "^0.4.9",
    "globals": "^15.9.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.11",
    "typescript": "^5.5.3",
    "typescript-eslint": "^8.0.1",
    "vite": "^5.4.1"
  }
}
```

**Step 2: Delete old lock files and reinstall**

```bash
cd "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite"
rm -f package-lock.json bun.lockb bun.lock
bun install
```

**Step 3: Verify the build works**

```bash
cd "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite"
bun run build
```

Expected: build succeeds with no errors.

**Step 4: Remove the sidebar color token from tailwind.config.ts**

In `tailwind.config.ts`, delete the `sidebar` block from the `colors` extend:

```typescript
// DELETE this block:
sidebar: {
  DEFAULT: 'hsl(var(--sidebar-background))',
  foreground: 'hsl(var(--sidebar-foreground))',
  primary: 'hsl(var(--sidebar-primary))',
  'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  accent: 'hsl(var(--sidebar-accent))',
  'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  border: 'hsl(var(--sidebar-border))',
  ring: 'hsl(var(--sidebar-ring))'
},
```

**Step 5: Commit**

```bash
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" add -A
git -C "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite" commit -m "chore: slim package.json and remove sidebar tokens"
```

---

### Task 10: Final verification

**Step 1: Run the dev server and confirm the app loads**

```bash
cd "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite"
bun run dev
```

Open `http://localhost:8080` — confirm:
- Writing interface loads
- Dark/light toggle works
- Download dropdown appears
- Info dialog opens
- Typing works

**Step 2: Run a final build**

```bash
bun run build
```

Expected: no TypeScript errors, no missing module errors, build succeeds.

**Step 3: Confirm file count is sane**

```bash
find "/Users/evancheriyan/Desktop/work/engineering/s:w/files/ezwrite/src" -type f | sort
```

Expected output should only be:
- `src/App.tsx`
- `src/components/InfoDialog.tsx`
- `src/components/SlashCommandPopup.tsx`
- `src/components/TimerWidget.tsx`
- `src/components/WritingInterface.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/tooltip.tsx`
- `src/components/writing-helpers.ts`
- `src/index.css`
- `src/lib/utils.ts`
- `src/main.tsx`
- `src/vite-env.d.ts`
