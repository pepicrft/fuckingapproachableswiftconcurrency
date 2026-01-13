---
layout: base.njk
title: Common Swift Concurrency Errors
description: Quick explanations and fixes for frequent Swift concurrency compiler errors, with links back to the main guide.
lang: en
dir: ltr
nav:
  overview: Overview
  async-await: Async/Await
  sendable: Sendable
  execution: Isolation
  tasks: Tasks
  keypaths: Key Paths
footer:
  madeWith: Made with frustration and love. Because Swift concurrency doesn't have to be confusing.
  viewOnGitHub: View on GitHub
---

<section class="hero">
  <div class="container">
    <h1>Common <span class="accent">Swift Concurrency Errors</span></h1>
    <p class="subtitle">What the compiler is yelling about and where to fix it.</p>
    <p class="credit">Use these errors as a map back to the main guide. Every message links to the section that explains the rule.</p>
  </div>
</section>

<section id="overview">
  <div class="container">

## [Overview](#overview)

Swift's concurrency errors usually mean you crossed an isolation boundary the wrong way, forgot an `await`, or sent a value the compiler can't prove is safe. Each entry here shows the message, why it appears, and where to read more.

  </div>
</section>

<section id="async-await">
  <div class="container">

## [Async/await slip-ups](#async-await)

### `Expression is 'async' but is not marked with 'await'`

```text
Expression is 'async' but is not marked with 'await'
```

You're calling an `async` function but not suspending for it. The caller is either missing `await` or isn't marked `async`.

- Fix: add `await`, and if the surrounding function is synchronous, move the call inside a `Task` or make the function `async`.
- Read more: [Async/await basics](/en/#async-await).

  </div>
</section>

<section id="sendable">
  <div class="container">

## [Sendable problems](#sendable)

### `Sending value of non-Sendable type 'T' risks causing data races`

```text
Sending value of non-Sendable type 'T' risks causing data races
```

You moved a value across actors or Tasks that isn't `Sendable`. Swift can't guarantee the type won't be mutated from two places at once.

- Fix: make the type `Sendable`, wrap shared state in an actor, or send an immutable copy that is already `Sendable`.
- Read more: [Sendable rules](/en/#sendable).

### `Cannot pass argument of non-sendable type 'T' across actors`

```text
Cannot pass argument of non-sendable type 'T' across actors
```

Similar to the previous error, but triggered when you pass a non-Sendable argument into an actor-isolated method.

- Fix: add `Sendable` conformance, or restructure so the work happens inside the actor that owns the value.
- Read more: [Sendable rules](/en/#sendable) and [Isolation basics](/en/#execution).

  </div>
</section>

<section id="execution">
  <div class="container">

## [Isolation mix-ups](#execution)

### `Call to main actor-isolated function cannot be made from a non-isolated context`

```text
Call to main actor-isolated function cannot be made from a non-isolated context
```

You're on a background or non-isolated function trying to call something marked `@MainActor`.

- Fix: hop to the main actor with `await MainActor.run { ... }`, mark the caller `@MainActor`, or refactor so UI work stays on the main actor.
- Read more: [Isolation domains](/en/#execution).

### `Actor-isolated property 'X' can not be referenced from a non-isolated context`

```text
Actor-isolated property 'X' can not be referenced from a non-isolated context
```

Actor state must be accessed from within that actor. Reading the property directly from the outside violates isolation.

- Fix: expose an `async` method on the actor, or make the caller `isolated` to the same actor so it can access the property safely.
- Read more: [Isolation domains](/en/#execution).

  </div>
</section>

<section id="tasks">
  <div class="container">

## [Task boundaries](#tasks)

### `Task-isolated value of type 'T' passed as a strongly transferred parameter`

```text
Task-isolated value of type 'T' passed as a strongly transferred parameter
```

You're trying to move a value that is only safe inside the current `Task` (often non-Sendable) into another task or closure that might outlive it.

- Fix: copy the needed data into a `Sendable` value before handing it off, or keep the work inside the same task instead of transferring ownership.
- Read more: [Tasks and child tasks](/en/#tasks) and [Sendable rules](/en/#sendable).

  </div>
</section>

<section id="keypaths">
  <div class="container">

## [Key path limitations](#keypaths)

### `Cannot form key path to main actor-isolated property 'X'`

```text
Cannot form key path to main actor-isolated property 'X'
```

Key paths can escape to other threads, so the compiler blocks forming one to a main-actor property.

- Fix: access the property directly on the main actor, or expose a computed value that is `Sendable` and not actor-isolated.
- Read more: [Isolation domains](/en/#execution).

  </div>
</section>
