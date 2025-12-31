# AGENTS.md - AI Coding Agent Guidelines

## Project Overview

**Fucking Approachable Swift Concurrency** is a multilingual static documentation website that teaches Swift concurrency concepts using clear mental models and the "Office Building" analogy. Built with [Eleventy (11ty)](https://www.11ty.dev/).

**Live Site:** https://fuckingapproachableswiftconcurrency.com

## Tech Stack

- **Static Site Generator:** Eleventy 3.x
- **Template Engine:** Nunjucks (.njk)
- **Content Format:** Markdown with embedded HTML
- **Styling:** Vanilla CSS with CSS custom properties
- **Syntax Highlighting:** @11ty/eleventy-plugin-syntaxhighlight (Prism)
- **Package Manager:** pnpm
- **Node Version:** LTS (managed via mise.toml)

## Project Structure

```
/
├── src/
│   ├── en/index.md          # English content
│   ├── ko/index.md          # Korean translation
│   ├── ja/index.md          # Japanese translation
│   ├── zh-CN/index.md       # Simplified Chinese translation
│   ├── zh-TW/index.md       # Traditional Chinese translation
│   ├── ar/index.md          # Arabic translation (RTL)
│   ├── css/
│   │   └── style.css        # Main stylesheet with RTL support
│   ├── images/              # Favicons and images
│   ├── _layouts/
│   │   └── base.njk         # HTML base template
│   ├── _includes/           # Reusable components
│   └── _redirects           # Language detection redirects
├── _site/                   # Build output (generated)
├── eleventy.config.js       # Eleventy configuration
├── package.json
└── mise.toml                # Tool version management
```

## Commands

```bash
# Install dependencies
pnpm install

# Development server with live reload
pnpm dev

# Production build
pnpm build
```

## Content Structure

Each language version (e.g., `src/en/index.md`) contains:

1. **Frontmatter** with:
   - `layout`: base.njk
   - `title`: Page title in the language
   - `description`: SEO description
   - `lang`: Language code (en, ko, ja, zh-CN, zh-TW, ar)
   - `dir`: Text direction (ltr or rtl)
   - `nav`: Navigation labels
   - `footer`: Footer text

2. **Content sections** (in order):
   - Hero section
   - TL;DR section
   - Isolation basics
   - Isolation domains (MainActor, actors, nonisolated)
   - How isolation propagates
   - Sendable types
   - Async/await
   - Patterns that work
   - Common mistakes
   - Compiler errors
   - Three levels of Swift concurrency
   - Glossary
   - Further reading

## Styling Guidelines

- **Color scheme:** Warm palette with Swift orange (#F05138) accent
- **Fonts:** Playfair Display (serif headings), Inter (body), JetBrains Mono (code)
- **Special boxes:** Use classes `.analogy`, `.tip`, `.warning` for callout boxes
- **Code highlighting:** Isolation domains use colored sidebars (`.code-isolation`)

## Localization (i18n)

### Adding a New Language

1. Create a new folder: `src/{lang-code}/`
2. Copy `src/en/index.md` to the new folder
3. Update frontmatter with the new language code and direction
4. Translate all content (keep code blocks, HTML structure, and URLs intact)
5. Add the language to `eleventy.config.js` in the `languages` global data
6. Add the language to `_redirects` for automatic detection
7. Add appropriate Google Font for the language in `base.njk`

### RTL Support

For RTL languages (like Arabic):
- Set `dir: rtl` in frontmatter
- The CSS automatically handles:
  - Text direction
  - Border positions (left borders become right)
  - Flexbox directions
  - Sidebar positions

## Key Concepts

The guide uses the **Office Building** analogy throughout:
- **Office building** = Your app
- **Offices** = Isolation domains
- **Front desk** = MainActor (UI thread)
- **Department offices** = Custom actors
- **Hallways** = Nonisolated code
- **Photocopies** = Sendable types
- **Original documents** = Non-Sendable types

## Important Notes

1. **Code blocks are NOT translated** - only comments inside code should be translated
2. **Keep all URLs unchanged** when translating
3. **Maintain HTML structure** - classes like `.analogy`, `.tip`, `.warning` must remain
4. **Preserve Swift code syntax** - never modify actual Swift code
5. **External links** to Matt Massicotte's blog and Apple documentation remain in English

## Testing

The project uses Playwright for browser testing:
```bash
pnpm exec playwright test
```

## Deployment

The site is designed for deployment on:
- Netlify (supports `_redirects` natively)
- Cloudflare Pages
- GitHub Pages (may need additional configuration for redirects)

The `_redirects` file handles language-based routing using the Accept-Language header.

## AI Agent Skill

The project includes a **SKILL.md** file at `src/SKILL.md` that packages the Swift Concurrency knowledge for use with AI coding agents (Claude Code, Cursor, etc.).

### Keeping SKILL.md in Sync

When updating content in the language files (especially `src/en/index.md`), ensure that significant changes are reflected in `src/SKILL.md`:

- New concepts or mental models
- Updated best practices or recommendations
- New common mistakes or pitfalls
- Changes to the "Office Building" analogy
- Updates related to new Swift versions (e.g., Swift 6.2 Approachable Concurrency)

The skill file should remain a condensed, actionable reference. It does not need to mirror every detail, but should capture the essential guidance that helps developers write correct concurrent Swift code.

### Skill Distribution

The SKILL.md file is served as a static asset at `https://fuckingapproachableswiftconcurrency.com/SKILL.md`. Users can:

1. Download it directly and place it in their agent's skills directory
2. Reference it in their agent configuration
3. Use it as a personal skill (`~/.claude/skills/swift-concurrency/SKILL.md`)
4. Use it as a project skill (`.claude/skills/swift-concurrency/SKILL.md`)

## Credits

- Original content and mental models inspired by [Matt Massicotte's blog](https://www.massicotte.org/)
- Built by [Pedro Piñera](https://pepicrft.me)
- In the tradition of [fuckingblocksyntax.com](https://fuckingblocksyntax.com/) and [fuckingifcaseletsyntax.com](https://fuckingifcaseletsyntax.com/)
