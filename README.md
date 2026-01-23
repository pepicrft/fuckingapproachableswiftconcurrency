# Fucking Approachable Swift Concurrency
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-5-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

A no-bullshit guide to understanding Swift concurrency. Learn async/await, actors, Sendable, and MainActor with simple mental models.

**[Visit the site](https://fuckingapproachableswiftconcurrency.com)**

## About

Swift concurrency can be confusing. This site distills the best resources into clear, approachable mental models that anyone can understand.

In the tradition of [fuckingblocksyntax.com](https://fuckingblocksyntax.com/) and [fuckingifcaseletsyntax.com](https://fuckingifcaseletsyntax.com/).

## Topics Covered

- **Async/Await** - Suspension vs blocking, and why it matters
- **Tasks** - Managing async work with Task and TaskGroup
- **Isolation** - The core mental model for Swift concurrency (MainActor, actors, nonisolated)
- **Sendable** - What can safely cross isolation boundaries
- **Isolation Inheritance** - How isolation flows through your code
- **Common Mistakes** - And how to avoid them

## Languages

Available in 10 languages: English, Spanish, Portuguese (BR & PT), Arabic, Korean, Japanese, Chinese (Simplified & Traditional), Russian and Turkish.

## Development

This site is built with [Eleventy](https://www.11ty.dev/).

### Prerequisites

- [mise](https://mise.jdx.dev/) (for managing Node.js and pnpm)

### Setup

```bash
mise install
pnpm install
```

### Development Server

```bash
pnpm dev
```

Then open **http://localhost:8080/** in your browser.

### Build

```bash
pnpm build
```

## Credits

Much of this guide is distilled from [Matt Massicotte's](https://www.massicotte.org/) excellent work on Swift concurrency.

## License

MIT License - see [LICENSE.md](LICENSE.md)

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/AkshayAShah"><img src="https://avatars.githubusercontent.com/u/148655?v=4?s=100" width="100px;" alt="Akshay"/><br /><sub><b>Akshay</b></sub></a><br /><a href="#content-AkshayAShah" title="Content">🖋</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://peterspath.net"><img src="https://avatars.githubusercontent.com/u/211143281?v=4?s=100" width="100px;" alt="Peter's Path"/><br /><sub><b>Peter's Path</b></sub></a><br /><a href="#content-peterspath" title="Content">🖋</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://www.stormacq.com"><img src="https://avatars.githubusercontent.com/u/401798?v=4?s=100" width="100px;" alt="Sébastien Stormacq"/><br /><sub><b>Sébastien Stormacq</b></sub></a><br /><a href="#content-sebsto" title="Content">🖋</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/exproot"><img src="https://avatars.githubusercontent.com/u/72192187?v=4?s=100" width="100px;" alt="Ertan"/><br /><sub><b>Ertan</b></sub></a><br /><a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/commits?author=exproot" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://vikram.kriplaney.com"><img src="https://avatars.githubusercontent.com/u/55100?v=4?s=100" width="100px;" alt="Vikram Kriplaney"/><br /><sub><b>Vikram Kriplaney</b></sub></a><br /><a href="#content-markiv" title="Content">🖋</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!