# Urgent

- **Remove an unused plugin** — There's a text-styling plugin listed in your project's ingredient list (`@tailwindcss/typography`) that you never actually use. Like buying a spice you never cook with — harmless but unnecessary clutter.

- **Pick one package manager** — Your project has two "shopping lists" for its software ingredients (`bun.lock` and `package-lock.json`). They do the same job. Having both can cause confusion — like keeping two different grocery lists for the same meal. Pick whichever you use to build and delete the other.

- **Turn on stricter spell-check for code** — TypeScript (the language your app is written in) has a "strict mode" that catches more mistakes automatically. Yours is turned off. Turning it on is like enabling grammar-check — it might flag some things to fix, but it catches real bugs before your users do.

- **Test on a real phone** — Dev tools can simulate a phone, but real devices behave differently. Worth opening the app on your actual phone, trying the timer, typing, installing it as a PWA (the "Add to Home Screen" option).

- **Check social previews** — When someone shares your app's link on Twitter, iMessage, or Slack, a little preview card shows up. Worth pasting your URL into a chat to make sure that card looks right.
