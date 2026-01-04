---
layout: base.njk
title: Fucking Approachable Swift Concurrency
description: A no-bullshit guide to Swift concurrency. Learn async/await, actors, Sendable, and MainActor with simple mental models. No jargon, just clear explanations.
lang: en
dir: ltr
nav:
  async-await: Async/Await
  tasks: Tasks
  execution: Isolation
  sendable: Sendable
  putting-it-together: Summary
  mistakes: Pitfalls
footer:
  madeWith: Made with frustration and love. Because Swift concurrency doesn't have to be confusing.
  viewOnGitHub: View on GitHub
---

<section class="hero">
  <div class="container">
    <h1>Fucking Approachable<br><span class="accent">Swift Concurrency</span></h1>
    <p class="subtitle">Finally understand async/await, Tasks, and why the compiler keeps yelling at you.</p>
    <p class="credit">Huge thanks to <a href="https://www.massicotte.org/">Matt Massicotte</a> for making Swift concurrency understandable. Put together by <a href="https://pepicrft.me">Pedro Piñera</a>, co-founder of <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist</a>. Found an issue? <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/issues/new">Open an issue</a> or <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/pulls">submit a PR</a>.</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [Async Code: async/await](#async-await)

Most of what apps do is wait. Fetch data from a server - wait for the response. Read a file from disk - wait for the bytes. Query a database - wait for the results.

Before Swift's concurrency system, you'd express this waiting with callbacks, delegates, or [Combine](https://developer.apple.com/documentation/combine). They work, but nested callbacks get hard to follow, and Combine has a steep learning curve.

`async/await` gives Swift a new way to handle waiting. Instead of callbacks, you write code that looks sequential - it pauses, waits, and resumes. Under the hood, Swift's runtime manages these pauses efficiently. But making your app actually stay responsive while waiting depends on *where* code runs, which we'll cover later.

An **async function** is one that might need to pause. You mark it with `async`, and when you call it, you use `await` to say "pause here until this finishes":

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // Suspends here
    return try JSONDecoder().decode(User.self, from: data)
}

// Calling it
let user = try await fetchUser(id: 123)
// Code here runs after fetchUser completes
```

Your code pauses at each `await` - this is called **suspension**. When the work finishes, your code resumes right where it left off. Suspension gives Swift the opportunity to do other work while waiting.

### Waiting for *them*

What if you need to fetch several things? You could await them one by one:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

But that's slow - each waits for the previous one to finish. Use `async let` to run them in parallel:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // All three are fetching in parallel!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

Each `async let` starts immediately. The `await` collects the results.

<div class="tip">
<h4>await needs async</h4>

You can only use `await` inside an `async` function.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [Managing Work: Tasks](#tasks)

A **[Task](https://developer.apple.com/documentation/swift/task)** is a unit of async work you can manage. You've written async functions, but a Task is what actually runs them. It's how you start async code from synchronous code, and it gives you control over that work: wait for its result, cancel it, or let it run in the background.

Let's say you're building a profile screen. Load the avatar when the view appears using the [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)) modifier, which cancels automatically when the view disappears:

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task { avatar = await downloadAvatar() }
    }
}
```

If users can switch between profiles, use `.task(id:)` to reload when the selection changes:

```swift
struct ProfileView: View {
    var userID: String
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task(id: userID) { avatar = await downloadAvatar(for: userID) }
    }
}
```

When the user taps "Save", create a Task manually:

```swift
Button("Save") {
    Task { await saveProfile() }
}
```

### Accessing Task Results

When you create a Task, you get a handle back. Use `.value` to wait for and retrieve the result:

```swift
let handle = Task {
    return await fetchUserData()
}
let userData = await handle.value  // Suspends until task completes
```

This is useful when you need the result later, or when you want to store the task handle and await it elsewhere.

What if you need to load the avatar, bio, and stats all at once? Use a [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) to fetch them in parallel:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

Tasks inside a group are **child tasks**, linked to the parent. A few things to know:

- **Cancellation propagates**: cancel the parent, and all children get cancelled too
- **Errors**: a thrown error cancels siblings and rethrows, but only when you consume results with `next()`, `waitForAll()`, or iteration
- **Completion order**: results arrive as tasks finish, not the order you added them
- **Waits for all**: the group doesn't return until every child completes or is cancelled

This is **[structured concurrency](https://developer.apple.com/videos/play/wwdc2021/10134/)**: work organized in a tree that's easy to reason about and clean up.

  </div>
</section>

<section id="execution">
  <div class="container">

## [Where Things Run: From Threads to Isolation Domains](#execution)

So far we've talked about *when* code runs (async/await) and *how to organize* it (Tasks). Now: **where does it run, and how do we keep it safe?**

<div class="tip">
<h4>Most apps just wait</h4>

Most app code is **I/O-bound**. You fetch data from a network, *await* a response, decode it, and display it. If you have multiple I/O operations to coordinate, you resort to *tasks* and *task groups*. The actual CPU work is minimal. The main thread can handle this fine because `await` suspends without blocking.

But sooner or later, you'll have **CPU-bound work**: parsing a giant JSON file, processing images, running complex calculations. This work doesn't wait for anything external. It just needs CPU cycles. If you run it on the main thread, your UI freezes. This is where "where does code run" actually matters.
</div>

### The Old World: Many Options, No Safety

Before Swift's concurrency system, you had several ways to manage execution:

| Approach | What it does | Tradeoffs |
|----------|--------------|-----------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | Direct thread control | Low-level, error-prone, rarely needed |
| [GCD](https://developer.apple.com/documentation/dispatch) | Dispatch queues with closures | Simple but no cancellation, easy to cause thread explosion |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | Task dependencies, cancellation, KVO | More control but verbose and heavyweight |
| [Combine](https://developer.apple.com/documentation/combine) | Reactive streams | Great for event streams, steep learning curve |

All of these worked, but safety was entirely on you. The compiler couldn't help if you forgot to dispatch to main, or if two queues accessed the same data simultaneously.

### The Problem: Data Races

A [data race](https://developer.apple.com/documentation/xcode/data-races) happens when two threads access the same memory at the same time, and at least one is writing:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// Undefined behavior: crash, memory corruption, or wrong value
```

Data races are undefined behavior. They can crash, corrupt memory, or silently produce wrong results. Your app works fine in testing, then crashes randomly in production. Traditional tools like locks and semaphores help, but they're manual and error-prone.

<div class="warning">
<h4>Concurrency amplifies the problem</h4>

The more concurrent your app is, the more likely data races become. A simple iOS app might get away with sloppy thread safety. A web server handling thousands of simultaneous requests will crash constantly. This is why Swift's compile-time safety matters most in high-concurrency environments.
</div>

### The Shift: From Threads to Isolation

Swift's concurrency model asks a different question. Instead of "which thread should this run on?", it asks: **"who is allowed to access this data?"**

This is [isolation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation). Rather than manually dispatching work to threads, you declare boundaries around data. The compiler enforces these boundaries at build time, not runtime.

<div class="tip">
<h4>Under the hood</h4>

Swift Concurrency is built on top of [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (the same runtime as GCD). The difference is the compile-time layer: actors and isolation are enforced by the compiler, while the runtime handles scheduling on a [cooperative thread pool](https://developer.apple.com/videos/play/wwdc2021/10254/) limited to your CPU's core count.
</div>

### The Three Isolation Domains

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) is a [global actor](https://developer.apple.com/documentation/swift/globalactor) that represents the main thread's isolation domain. It's special because UI frameworks (UIKit, AppKit, SwiftUI) require main thread access.

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // Protected by MainActor isolation
}
```

When you mark something `@MainActor`, you're not saying "dispatch this to the main thread." You're saying "this belongs to the main actor's isolation domain." The compiler enforces that anything accessing it must either be on MainActor or `await` to cross the boundary.

<div class="tip">
<h4>When in doubt, use @MainActor</h4>

For most apps, marking your ViewModels with `@MainActor` is the right choice. Performance concerns are usually overblown. Start here, optimize only if you measure actual problems.
</div>

**2. Actors**

An [actor](https://developer.apple.com/documentation/swift/actor) protects its own mutable state. It guarantees that only one piece of code can access its data at a time:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // Safe: actor guarantees exclusive access
    }
}

// From outside, you must await to cross the boundary
await account.deposit(100)
```

**Actors are not threads.** An actor is an isolation boundary. The Swift runtime decides which thread actually executes actor code. You don't control that, and you don't need to.

**3. Nonisolated**

Code marked [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) opts out of actor isolation. It can be called from anywhere without `await`, but it cannot access the actor's protected state:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // No actor state accessed, safe to call from anywhere
    }
}

let name = account.bankName()  // No await needed
```

<div class="tip">
<h4>Approachable Concurrency: Less Friction</h4>

[Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) simplifies the mental model with two Xcode build settings:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: Everything runs on MainActor unless you say otherwise
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: `nonisolated` async functions stay on the caller's actor instead of jumping to a background thread

New Xcode 26 projects have both enabled by default. When you need CPU-intensive work off the main thread, use `@concurrent`.

<pre><code class="language-swift">// Runs on MainActor (the default)
func updateUI() async { }

// Runs on background thread (opt-in)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>The Office Building</h4>

Think of your app as an office building. Each **isolation domain** is a private office with a lock on the door. Only one person can be inside at a time, working with the documents in that office.

- **`MainActor`** is the front desk - where all customer interactions happen. There's only one, and it handles everything the user sees.
- **`actor`** types are department offices - Accounting, Legal, HR. Each protects its own sensitive documents.
- **`nonisolated`** code is the hallway - shared space anyone can walk through, but no private documents live there.

You can't just barge into someone's office. You knock (`await`) and wait for them to let you in.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [What Can Cross Isolation Domains: Sendable](#sendable)

Isolation domains protect data, but eventually you need to pass data between them. When you do, Swift checks if it's safe.

Think about it: if you pass a reference to a mutable class from one actor to another, both actors could modify it simultaneously. That's exactly the data race we're trying to prevent. So Swift needs to know: can this data be safely shared?

The answer is the [`Sendable`](https://developer.apple.com/documentation/swift/sendable) protocol. It's a marker that tells the compiler "this type is safe to pass across isolation boundaries":

- **Sendable** types can cross safely (value types, immutable data, actors)
- **Non-Sendable** types can't (classes with mutable state)

```swift
// Sendable - it's a value type, each place gets a copy
struct User: Sendable {
    let id: Int
    let name: String
}

// Non-Sendable - it's a class with mutable state
class Counter {
    var count = 0  // Two places modifying this = disaster
}
```

### Making Types Sendable

Swift automatically infers `Sendable` for many types:

- **Structs and enums** with only `Sendable` properties are implicitly `Sendable`
- **Actors** are always `Sendable` because they protect their own state
- **`@MainActor` types** are `Sendable` because MainActor serializes access

For classes, it's harder. A class can conform to `Sendable` only if it's `final` and all its stored properties are immutable:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // Immutable
    let timeout: Double   // Immutable
}
```

If you have a class that's thread-safe through other means (locks, atomics), you can use [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable) to tell the compiler "trust me":

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable is a promise</h4>

The compiler won't verify thread safety. If you're wrong, you'll get data races. Use sparingly.
</div>

<div class="tip">
<h4>Approachable Concurrency: Less Friction</h4>

With [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), Sendable errors become much rarer:

- If code doesn't cross isolation boundaries, you don't need Sendable
- Async functions stay on the caller's actor instead of hopping to a background thread
- The compiler is smarter about detecting when values are used safely

Enable it by setting `SWIFT_DEFAULT_ACTOR_ISOLATION` to `MainActor` and `SWIFT_APPROACHABLE_CONCURRENCY` to `YES`. New Xcode 26 projects have both enabled by default. When you do need parallelism, mark functions `@concurrent` and then think about Sendable.
</div>

<div class="analogy">
<h4>Photocopies vs. Original Documents</h4>

Back to the office building. When you need to share information between departments:

- **Photocopies are safe** - If Legal makes a copy of a document and sends it to Accounting, both have their own copy. They can scribble on them, modify them, whatever. No conflict.
- **Original signed contracts must stay put** - If two departments could both modify the original, chaos ensues. Who has the real version?

`Sendable` types are like photocopies: safe to share because each place gets its own independent copy (value types) or because they're immutable (nobody can modify them). Non-`Sendable` types are like original contracts: passing them around creates the potential for conflicting modifications.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [How Isolation Is Inherited](#isolation-inheritance)

You've seen that isolation domains protect data, and Sendable controls what crosses between them. But how does code end up in an isolation domain in the first place?

When you call a function or create a closure, isolation flows through your code. With [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), your app starts on [`MainActor`](https://developer.apple.com/documentation/swift/mainactor), and that isolation propagates to the code you call, unless something explicitly changes it. Understanding this flow helps you predict where code runs and why the compiler sometimes complains.

### Function Calls

When you call a function, its isolation determines where it runs:

```swift
@MainActor func updateUI() { }      // Always runs on MainActor
func helper() { }                    // Inherits caller's isolation
@concurrent func crunch() async { }  // Explicitly runs off-actor
```

With [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), most of your code inherits `MainActor` isolation. The function runs where the caller runs, unless it explicitly opts out.

### Closures

Closures inherit isolation from the context where they're defined:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // Inherits MainActor from ViewModel
            self.updateUI()  // Safe, same isolation
        }
        closure()
    }
}
```

This is why SwiftUI's `Button` action closures can safely update `@State`: they inherit MainActor isolation from the view.

### Tasks

A `Task { }` inherits actor isolation from where it's created:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // Inherits MainActor isolation
            self.updateUI()  // Safe, no await needed
        }
    }
}
```

This is usually what you want. The task runs on the same actor as the code that created it.

### Breaking Inheritance: Task.detached

Sometimes you want a task that doesn't inherit any context:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // No actor isolation, runs on cooperative pool
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // Explicitly hop back
            }
        }
    }
}
```

<div class="warning">
<h4>Task and Task.detached are an anti-pattern</h4>

The tasks you schedule with `Task { ... }` are not managed. There is no way for you to cancel them or to know when they finish, if ever. There is no way to access their return value or to know if they encounter an error. In the majority of the cases, it will be better to use tasks managed by a `.task` or `TaskGroup`, [as explained in the "Common mistakes" section](#managedtasks).

[Task.detached should be your last resort](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). Detached tasks don't inherit priority, task-local values, or actor context. If you need CPU-intensive work off the main actor, mark the function `@concurrent` instead.
</div>

<div class="analogy">
<h4>Walking Through the Building</h4>

When you're in the front desk office (MainActor), and you call someone to help you, they come to *your* office. They inherit your location. If you create a task ("go do this for me"), that assistant starts in your office too.

The only way someone ends up in a different office is if they explicitly go there: "I need to work in Accounting for this" (`actor`), or "I'll handle this in the back office" (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [Putting It All Together](#putting-it-together)

Let's step back and see how all the pieces fit.

Swift Concurrency can feel like a lot of concepts: `async/await`, `Task`, actors, `MainActor`, `Sendable`, isolation domains. But there's really just one idea at the center of it all: **isolation is inherited by default**.

With [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) enabled, your app starts on [`MainActor`](https://developer.apple.com/documentation/swift/mainactor). That's your starting point. From there:

- Every function you call **inherits** that isolation
- Every closure you create **captures** that isolation
- Every [`Task { }`](https://developer.apple.com/documentation/swift/task) you spawn **inherits** that isolation

You don't have to annotate anything. You don't have to think about threads. Your code runs on `MainActor`, and the isolation just propagates through your program automatically.

When you need to break out of that inheritance, you do it explicitly:

- **`@concurrent`** says "run this on a background thread"
- **`actor`** says "this type has its own isolation domain"
- **`Task.detached { }`** says "start fresh, inherit nothing"

And when you pass data between isolation domains, Swift checks that it's safe. That's what [`Sendable`](https://developer.apple.com/documentation/swift/sendable) is for: marking types that can safely cross boundaries.

That's it. That's the whole model:

1. **Isolation propagates** from `MainActor` through your code
2. **You opt out explicitly** when you need background work or separate state
3. **Sendable guards the boundaries** when data crosses between domains

When the compiler complains, it's telling you one of these rules was violated. Trace the inheritance: where did the isolation come from? Where is the code trying to run? What data is crossing a boundary? The answer is usually obvious once you ask the right question.

### Where to Go From Here

The good news: you don't need to master everything at once.

**Most apps only need the basics.** Mark your ViewModels with `@MainActor`, use `async/await` for network calls, and create `Task { }` when you need to kick off async work from a button tap. That's it. That handles 80% of real-world apps. The compiler will tell you if you need more.

**When you need parallel work**, reach for `async let` to fetch multiple things at once, or [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) when the number of tasks is dynamic. Learn to handle cancellation gracefully. This covers apps with complex data loading or real-time features.

**Advanced patterns come later**, if ever. Custom actors for shared mutable state, `@concurrent` for CPU-intensive processing, deep `Sendable` understanding. This is framework code, server-side Swift, complex desktop apps. Most developers never need this level.

<div class="tip">
<h4>Start simple</h4>

Don't optimize for problems you don't have. Start with the basics, ship your app, and add complexity only when you hit real problems. The compiler will guide you.
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [Watch Out: Common Mistakes](#mistakes)

### Thinking async = background

```swift
// This STILL blocks the main thread!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // Synchronous work = blocking
    data = result
}
```

`async` means "can pause." The actual work still runs wherever it runs. Use `@concurrent` (Swift 6.2) or `Task.detached` for CPU-heavy work.

### Creating too many actors

```swift
// Over-engineered
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// Better - most things can live on MainActor
@MainActor
class AppState { }
```

You need a custom actor only when you have shared mutable state that can't live on `MainActor`. [Matt Massicotte's rule](https://www.massicotte.org/actors/): introduce an actor only when (1) you have non-`Sendable` state, (2) operations on that state must be atomic, and (3) those operations can't run on an existing actor. If you can't justify it, use `@MainActor` instead.

### Making everything Sendable

Not everything needs to cross boundaries. If you're adding `@unchecked Sendable` everywhere, step back and ask if the data actually needs to move between isolation domains.

### Using MainActor.run when you don't need it

```swift
// Unnecessary
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// Better - just make the function @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` is rarely the right solution. If you need MainActor isolation, annotate the function with `@MainActor` instead. It's clearer and the compiler can help you more. See [Matt's take on this](https://www.massicotte.org/problematic-patterns/).

### Blocking the cooperative thread pool

```swift
// NEVER do this - risks deadlock
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // Blocks a cooperative thread!
}
```

Swift's cooperative thread pool has limited threads. Blocking one with `DispatchSemaphore`, `DispatchGroup.wait()`, or similar calls can cause deadlocks. If you need to bridge sync and async code, use `async let` or restructure to stay fully async.

<div id="managedtasks">

### Create unmanaged tasks

Tasks that you create manually with `Task { ... }` or `Task.detached { ... }` are not managed. After you create unmanaged tasks, you can't control them. You can't cancel them if the task from which you started it is cancelled. You can't know if they finished their work, if they threw an error, or collect their return value. Starting such a task is like throwing a bottle into the sea and hoping it will deliver its message to its destination, without ever seeing that bottle again.

<div class="analogy">
<h4>The Office Building</h4>

A `Task` is like assigning work to an employee. The employee handles the request (including waiting for other offices) while you continue with your immediate work.

After you dispatch work to the employee, you have no means to communicate with her. You can't tell her to stop the work or know if she finished and what the result of that work was.

What you actually want is to give the employee a walkie-talkie to communicate with her while she handles the request. With the walkie-talkie, you can tell her to stop, or she can tell you when she encounters an error, or she can report the result of the request you gave her.
</div>

Instead of creating unmanaged tasks, use Swift concurrency to keep control of the subtasks you create. Use `TaskGroup` to manage a (group of) subtask(s). Swift provides a couple of `withTaskGroup() { group in ... }` functions to help create task groups.

```swift
func doWork() async {

    // this will return when all subtasks return, throw an error, or are cancelled
    let result = try await withThrowingTaskGroup() { group in 
        group.addTask {
            try await self.performAsyncOperation1()  
        }
        group.addTask {
            try await self.performAsyncOperation2()  
        }
        // wait for and collect the results of the tasks here 
    }
}

func performAsyncOperation1() async throws -> Int {
    return 1
}
func performAsyncOperation2() async throws -> Int {
    return 2
}
```

To collect the results of the group's child tasks, you can use a for-await-in loop:

```swift
var sum = 0
for await result in group {
    sum += result
}
// sum == 3 
```

You can learn more about [TaskGroup](https://developer.apple.com/documentation/swift/taskgroup) in the Swift documentation.

#### Note about Tasks and SwiftUI.

When writing a UI, you often want to start asynchronous tasks from a synchronous context. For example, you want to asynchronously load an image as a response to a UI element touch. Starting asynchronous tasks from a synchronous context is not possible in Swift. This is why you see solutions involving `Task { ... }`, which introduces unmanaged tasks.

You can't use `TaskGroup` from a synchronous SwiftUI modifier because `withTaskGroup()` is an async function too and so are its related functions.

As an alternative, SwiftUI offers an asynchronous modifier that you can use to start asynchronous operations. The `.task { }` modifier, which we already mentioned, accepts a `() async -> Void` function, ideal for calling other `async` functions. It is available on every `View`. It is triggered before the view appears and the tasks it creates are managed and bound to the lifecycle of the view, meaning the tasks are cancelled when the view disappears.

Back to the tap-to-load-an-image example: instead of creating an unmanaged task to call an asynchronous `loadImage()` function from a synchronous `.onTap() { ... }` function, you can toggle a flag on the tap gesture and use the `task(id:)` modifier to asynchronoulsy load images when the `id` (the flag) value changes.

Here is a example:

```swift
struct ContentView: View {
    
    @State private var shouldLoadImage = false
    
    var body: some View {
        Button("Click Me !") {
            // toggle the flag
            shouldLoadImage = !shouldLoadImage
        }
        // the View manages the subtask
        // it starts before the view is displayed 
        // and stops when the view is hidden
        .task(id: shouldLoadImage) {
            // when the flag value changes, SwiftUI restarts the task
            guard shouldLoadImage else { return }
            await loadImage()
        }
    }
}
```
</div>

  </div>
</section>

<section id="glossary">
  <div class="container">

## [Cheat Sheet: Quick Reference](#glossary)

| Keyword | What it does |
|---------|--------------|
| `async` | Function can pause |
| `await` | Pause here until done |
| `Task { }` | Start async work, inherits context |
| `Task.detached { }` | Start async work, no inherited context |
| `@MainActor` | Runs on main thread |
| `actor` | Type with isolated mutable state |
| `nonisolated` | Opts out of actor isolation |
| `Sendable` | Safe to pass between isolation domains |
| `@concurrent` | Always run on background (Swift 6.2+) |
| `async let` | Start parallel work |
| `TaskGroup` | Dynamic parallel work |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [Further Reading](#further-reading)

<div class="resources">
<h4>Matt Massicotte's Blog (Highly Recommended)</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - Essential terminology
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - The core concept
- [When should you use an actor?](https://www.massicotte.org/actors/) - Practical guidance
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - Why simpler is better
</div>

<div class="resources">
<h4>Official Apple Resources</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>Tools</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) - Ship faster with larger teams and codebases
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [AI Agent Skill](#ai-skill)

Want your AI coding assistant to understand Swift Concurrency? We provide a **[SKILL.md](/SKILL.md)** file that packages these mental models for AI agents like Claude Code, Codex, Amp, OpenCode, and others.

<div class="tip">
<h4>What is a Skill?</h4>

A skill is a markdown file that teaches AI coding agents specialized knowledge. When you add the Swift Concurrency skill to your agent, it automatically applies these concepts when helping you write async Swift code.
</div>

### How to Use

Choose your agent and run the commands below:

<div class="code-tabs">
  <div class="code-tabs-nav">
    <button class="active">Claude Code</button>
    <button>Amp</button>
    <button>Codex</button>
    <button>Kiro</button>
    <button>OpenCode</button>
  </div>
  <div class="code-tab-content active">

```bash
# Personal skill (all your projects)
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Project skill (just this project)
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Project instructions (recommended)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Global instructions (all your projects)
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Project instructions (just this project)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>

  <div class="code-tab-content">

```bash
# Global rules (all your projects)
mkdir -p ~/.kiro/steering
curl -o ~/.kiro/steering/swift-concurrency.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Project rules (just this project)
mkdir -p .kiro/steering
curl -o .kiro/steering/swift-concurrency.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>

  <div class="code-tab-content">

```bash
# Global rules (all your projects)
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Project rules (just this project)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

The skill includes the Office Building analogy, isolation patterns, Sendable guidance, common mistakes, and quick reference tables. Your agent will use this knowledge automatically when you work with Swift Concurrency code.

  </div>
</section>
