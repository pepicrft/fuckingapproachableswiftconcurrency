---
layout: base.njk
title: 该死的易懂 Swift 并发
description: Swift 并发的直白指南。用简单的心智模型学习 async/await、actors、Sendable 和 MainActor。没有术语,只有清晰的解释。
lang: zh-CN
dir: ltr
nav:
  async-await: Async/Await
  tasks: Tasks
  execution: 隔离
  sendable: Sendable
  putting-it-together: 总结
  mistakes: 常见坑
footer:
  madeWith: 用挫折和爱制作。因为 Swift 并发不必令人困惑。
  tradition: 延续以下传统
  traditionAnd: 和
  viewOnGitHub: 在 GitHub 上查看
---

<section class="hero">
  <div class="container">
    <h1>该死的易懂<br><span class="accent">Swift 并发</span></h1>
    <p class="subtitle">终于能理解 async/await、Tasks,以及为什么编译器老是冲你嚷嚷了。</p>
    <p class="credit">特别感谢 <a href="https://www.massicotte.org/">Matt Massicotte</a> 让 Swift 并发变得易于理解。由 <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist</a> 联合创始人 <a href="https://pepicrft.me">Pedro Piñera</a> 整理。发现问题？<a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/issues/new">提交 Issue</a> 或 <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/pulls">发送 PR</a>。</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [异步代码:async/await](#async-await)

应用大部分时间都在等待。从服务器获取数据——等响应。从磁盘读文件——等字节。查询数据库——等结果。

在 Swift 并发系统出现之前,你得用回调、代理或 [Combine](https://developer.apple.com/documentation/combine) 来表达这种等待。它们能用,但嵌套回调很难读懂,Combine 的学习曲线也很陡。

`async/await` 给了 Swift 一种新的等待方式。不用回调,你写的代码看起来是顺序执行的——暂停、等待、恢复。底层,Swift 运行时高效地管理这些暂停。但让你的应用在等待时保持响应,取决于代码*在哪里*运行,这个我们后面会讲。

**异步函数**是可能需要暂停的函数。你用 `async` 标记它,调用时用 `await` 表示"在这里暂停直到完成":

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // 在这里挂起
    return try JSONDecoder().decode(User.self, from: data)
}

// 调用它
let user = try await fetchUser(id: 123)
// 这里的代码在 fetchUser 完成后执行
```

你的代码在每个 `await` 处暂停——这叫做**挂起**。当工作完成时,代码从原来的地方继续执行。挂起让 Swift 有机会在等待时做其他工作。

### 等*它们*

如果你需要获取好几样东西怎么办?你可以一个一个 await:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

但这很慢——每个都要等前一个完成。用 `async let` 让它们并行运行:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // 三个同时在获取!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

每个 `async let` 立即开始执行。`await` 收集结果。

<div class="tip">
<h4>await 需要 async</h4>

你只能在 `async` 函数内部使用 `await`。
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [管理工作:Tasks](#tasks)

**[Task](https://developer.apple.com/documentation/swift/task)** 是你可以管理的异步工作单元。你写了异步函数,但 Task 才是真正运行它们的东西。它让你从同步代码启动异步代码,并给你控制权:等待结果、取消它,或让它在后台运行。

假设你在做一个个人资料页面。当视图出现时用 [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)) 修饰符加载头像,视图消失时会自动取消:

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task { avatar = await downloadAvatar() }
    }
}
```

如果用户可以切换不同的个人资料,用 `.task(id:)` 在选择变化时重新加载:

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

当用户点击"保存"时,手动创建一个 Task:

```swift
Button("Save") {
    Task { await saveProfile() }
}
```

### 访问 Task 结果

当你创建一个 Task 时，会得到一个句柄。使用 `.value` 来等待并获取结果：

```swift
let handle = Task {
    return await fetchUserData()
}
let userData = await handle.value  // 暂停直到任务完成
```

当你需要稍后获取结果，或者想要保存任务句柄并在其他地方 await 它时，这很有用。

如果你需要同时加载头像、简介和统计数据怎么办?用 [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) 并行获取它们:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

组内的 Task 是**子任务**,与父任务关联。几个要点:

- **取消会传播**:取消父任务,所有子任务也会被取消
- **错误**:抛出的错误会取消兄弟任务并重新抛出,但只在你用 `next()`、`waitForAll()` 或迭代消费结果时
- **完成顺序**:结果按任务完成的顺序到达,不是添加的顺序
- **等待全部**:组在所有子任务完成或被取消之前不会返回

这就是**[结构化并发](https://developer.apple.com/videos/play/wwdc2021/10134/)**:工作组织成树形结构,易于理解和清理。

  </div>
</section>

<section id="execution">
  <div class="container">

## [代码在哪里运行:从线程到隔离域](#execution)

到目前为止我们讨论了代码*何时*运行(async/await)以及*如何组织*它(Tasks)。现在:**它在哪里运行,怎么保证安全?**

<div class="tip">
<h4>大多数应用只是在等待</h4>

大多数应用代码是 **I/O 密集型**的。你从网络获取数据,*await* 响应,解码它,然后显示。如果有多个 I/O 操作要协调,就用 *tasks* 和 *task groups*。实际的 CPU 工作很少。主线程完全可以处理,因为 `await` 是挂起而不是阻塞。

但迟早,你会遇到 **CPU 密集型工作**:解析巨大的 JSON 文件、处理图片、运行复杂计算。这种工作不等待任何外部东西。它只需要 CPU 周期。如果在主线程运行,UI 就会卡住。这时候"代码在哪里运行"才真正重要。
</div>

### 旧世界:选择多,安全少

在 Swift 并发系统之前,你有几种管理执行的方式:

| 方法 | 做什么 | 权衡 |
|----------|--------------|-----------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | 直接线程控制 | 底层、容易出错,很少需要 |
| [GCD](https://developer.apple.com/documentation/dispatch) | 带闭包的调度队列 | 简单但没有取消,容易导致线程爆炸 |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | 任务依赖、取消、KVO | 更多控制但啰嗦且重量级 |
| [Combine](https://developer.apple.com/documentation/combine) | 响应式流 | 适合事件流,学习曲线陡峭 |

这些都能用,但安全完全靠你自己。如果你忘了切回主线程,或两个队列同时访问相同数据,编译器帮不了你。

### 问题:数据竞争

[数据竞争](https://developer.apple.com/documentation/xcode/data-races)发生在两个线程同时访问同一块内存,且至少有一个在写:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// 未定义行为:崩溃、内存损坏或错误的值
```

数据竞争是未定义行为。它们可能崩溃、损坏内存,或默默产生错误结果。测试时应用好好的,生产环境就随机崩溃。传统工具如锁和信号量有帮助,但都是手动的,容易出错。

<div class="warning">
<h4>并发放大问题</h4>

应用越并发,数据竞争越可能发生。简单的 iOS 应用可能侥幸躲过线程安全问题。处理数千个并发请求的 Web 服务器会不断崩溃。这就是为什么 Swift 的编译时安全在高并发环境中最重要。
</div>

### 转变:从线程到隔离

Swift 的并发模型问的是不同的问题。不是"这应该在哪个线程运行?",而是:**"谁被允许访问这个数据?"**

这就是[隔离](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation)。你不是手动把工作派发到线程,而是声明数据周围的边界。编译器在构建时强制执行这些边界,而不是运行时。

<div class="tip">
<h4>底层原理</h4>

Swift 并发建立在 [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch)(和 GCD 同样的运行时)之上。区别在于编译时层:actors 和隔离由编译器强制执行,而运行时在[协作线程池](https://developer.apple.com/videos/play/wwdc2021/10254/)上处理调度,线程数限制为你 CPU 的核心数。
</div>

### 三种隔离域

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) 是一个[全局 actor](https://developer.apple.com/documentation/swift/globalactor),代表主线程的隔离域。它很特殊,因为 UI 框架(UIKit、AppKit、SwiftUI)需要主线程访问。

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // 受 MainActor 隔离保护
}
```

当你标记 `@MainActor` 时,你不是在说"把这个派发到主线程"。你是在说"这属于 main actor 的隔离域"。编译器强制任何访问它的代码要么在 MainActor 上,要么 `await` 来跨越边界。

<div class="tip">
<h4>拿不准时就用 @MainActor</h4>

对于大多数应用,用 `@MainActor` 标记你的 ViewModel 是正确的选择。性能问题通常被夸大了。从这里开始,只在你测量到实际问题时才优化。
</div>

**2. Actors**

[actor](https://developer.apple.com/documentation/swift/actor) 保护自己的可变状态。它保证一次只有一段代码可以访问它的数据:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // 安全:actor 保证独占访问
    }
}

// 从外部,你必须 await 来跨越边界
await account.deposit(100)
```

**Actors 不是线程。** Actor 是隔离边界。Swift 运行时决定实际哪个线程执行 actor 代码。你不控制这个,也不需要。

**3. Nonisolated**

标记 [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) 的代码退出 actor 隔离。它可以从任何地方调用而不需要 `await`,但不能访问 actor 受保护的状态:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // 没有访问 actor 状态,从任何地方调用都安全
    }
}

let name = account.bankName()  // 不需要 await
```

<div class="tip">
<h4>Approachable Concurrency:更少摩擦</h4>

[Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) 通过两个 Xcode 构建设置简化了心智模型:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: 除非你另外说明,一切都在 MainActor 上运行
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: `nonisolated` 异步函数留在调用者的 actor 上,而不是跳到后台线程

新的 Xcode 26 项目默认都启用了。当你需要 CPU 密集型工作离开主线程时,用 `@concurrent`。

<pre><code class="language-swift">// 在 MainActor 上运行(默认)
func updateUI() async { }

// 在后台线程运行(显式选择)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>办公楼</h4>

把你的应用想象成一座办公楼。每个**隔离域**是一间带锁的私人办公室。一次只有一个人可以在里面,处理那间办公室的文件。

- **`MainActor`** 是前台——所有客户互动发生的地方。只有一个,处理用户看到的一切。
- **`actor`** 类型是部门办公室——会计、法务、人力资源。每个保护自己的敏感文件。
- **`nonisolated`** 代码是走廊——任何人都可以走过的共享空间,但没有私人文件在那里。

你不能直接闯入别人的办公室。你敲门(`await`)然后等他们让你进去。
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [什么可以跨越隔离域:Sendable](#sendable)

隔离域保护数据,但最终你需要在它们之间传递数据。当你这样做时,Swift 检查是否安全。

想想看:如果你把一个可变类的引用从一个 actor 传给另一个,两个 actor 可能同时修改它。那正是我们要防止的数据竞争。所以 Swift 需要知道:这个数据可以安全共享吗?

答案是 [`Sendable`](https://developer.apple.com/documentation/swift/sendable) 协议。它是一个标记,告诉编译器"这个类型可以安全地跨隔离边界传递":

- **Sendable** 类型可以安全跨越(值类型、不可变数据、actors)
- **Non-Sendable** 类型不能(带可变状态的类)

```swift
// Sendable——它是值类型,每个地方得到一份拷贝
struct User: Sendable {
    let id: Int
    let name: String
}

// Non-Sendable——它是带可变状态的类
class Counter {
    var count = 0  // 两个地方同时修改这个 = 灾难
}
```

### 让类型变成 Sendable

Swift 自动为许多类型推断 `Sendable`:

- **结构体和枚举**只有 `Sendable` 属性时隐式为 `Sendable`
- **Actors** 总是 `Sendable`,因为它们保护自己的状态
- **`@MainActor` 类型**是 `Sendable`,因为 MainActor 序列化访问

对于类,就难了。类只有在是 `final` 且所有存储属性都不可变时才能遵循 `Sendable`:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // 不可变
    let timeout: Double   // 不可变
}
```

如果你有一个类通过其他方式保证线程安全(锁、原子操作),你可以用 [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable) 告诉编译器"相信我":

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable 是一个承诺</h4>

编译器不会验证线程安全。如果你错了,就会有数据竞争。谨慎使用。
</div>

<div class="tip">
<h4>Approachable Concurrency:更少摩擦</h4>

用 [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency),Sendable 错误会少很多:

- 如果代码不跨隔离边界,你不需要 Sendable
- 异步函数留在调用者的 actor 上,而不是跳到后台线程
- 编译器更聪明地检测值何时被安全使用

将 `SWIFT_DEFAULT_ACTOR_ISOLATION` 设为 `MainActor` 并将 `SWIFT_APPROACHABLE_CONCURRENCY` 设为 `YES` 来启用。新的 Xcode 26 项目默认都启用了。当你确实需要并行时,标记函数为 `@concurrent`,然后再考虑 Sendable。
</div>

<div class="analogy">
<h4>复印件 vs. 原件</h4>

回到办公楼。当你需要在部门之间共享信息时:

- **复印件是安全的**——如果法务复印一份文件发给会计,双方都有自己的副本。他们可以在上面涂写、修改,随便。没有冲突。
- **原始签名合同必须留在原地**——如果两个部门都能修改原件,就会一团糟。哪个是真正的版本?

`Sendable` 类型就像复印件:可以安全共享,因为每个地方得到自己独立的副本(值类型)或因为它们不可变(没人能修改)。Non-`Sendable` 类型就像原始合同:传来传去会造成冲突修改的可能。
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [隔离如何继承](#isolation-inheritance)

你已经看到隔离域保护数据,Sendable 控制什么可以跨越它们。但代码一开始怎么进入隔离域的?

当你调用函数或创建闭包时,隔离会流经你的代码。用 [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency),你的应用从 [`MainActor`](https://developer.apple.com/documentation/swift/mainactor) 开始,这个隔离传播到你调用的代码,除非有东西显式改变它。理解这个流动帮助你预测代码在哪里运行,以及为什么编译器有时会抱怨。

### 函数调用

当你调用函数时,它的隔离决定它在哪里运行:

```swift
@MainActor func updateUI() { }      // 总是在 MainActor 运行
func helper() { }                    // 继承调用者的隔离
@concurrent func crunch() async { }  // 显式在后台运行
```

用 [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency),你的大部分代码继承 `MainActor` 隔离。函数在调用者运行的地方运行,除非它显式选择退出。

### 闭包

闭包从定义它们的上下文继承隔离:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // 从 ViewModel 继承 MainActor
            self.updateUI()  // 安全,相同隔离
        }
        closure()
    }
}
```

这就是为什么 SwiftUI 的 `Button` action 闭包可以安全更新 `@State`:它们从视图继承 MainActor 隔离。

### Tasks

`Task { }` 从创建它的地方继承 actor 隔离:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // 继承 MainActor 隔离
            self.updateUI()  // 安全,不需要 await
        }
    }
}
```

这通常是你想要的。task 在创建它的代码所在的同一个 actor 上运行。

### 打破继承:Task.detached

有时你想要一个不继承任何上下文的 task:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // 没有 actor 隔离,在协作池上运行
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // 显式跳回来
            }
        }
    }
}
```

<div class="warning">
<h4>Task 和 Task.detached 是反模式</h4>

你用 `Task { ... }` 调度的任务是不受管理的。没有办法取消它们或知道它们何时完成,如果它们完成的话。没有办法访问它们的返回值或知道它们是否遇到了错误。在大多数情况下,使用由 `.task` 或 `TaskGroup` 管理的任务会更好,[如"常见错误"部分所述](#managedtasks)。

[Task.detached 应该是你的最后手段](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929)。分离的任务不继承优先级、task-local 值或 actor 上下文。如果你需要 CPU 密集型工作离开 main actor,把函数标记为 `@concurrent`。
</div>

### 在 Async 工具中保持隔离

有时你会写一个接受闭包的泛型 async 函数——包装器、重试助手、事务作用域。调用者传入闭包,你的函数执行它。很简单,对吧?

```swift
func measure<T>(
    _ label: String,
    block: () async throws -> T
) async rethrows -> T {
    let start = ContinuousClock.now
    let result = try await block()
    print("\(label): \(ContinuousClock.now - start)")
    return result
}
```

但当你从 `@MainActor` 上下文调用它时,Swift 会报错:

<div class="compiler-error">
Sending value of non-Sendable type '() async throws -> T' risks causing data races
</div>

发生了什么?你的闭包捕获了 MainActor 的状态,但 `measure` 是 `nonisolated` 的。Swift 看到一个非 Sendable 的闭包正在跨越隔离边界——这正是它设计来防止的。

最简单的解决方案是 `nonisolated(nonsending)`。它告诉 Swift 函数应该留在调用它的执行器上:

```swift
nonisolated(nonsending)
func measure<T>(
    _ label: String,
    block: () async throws -> T
) async rethrows -> T {
    let start = ContinuousClock.now
    let result = try await block()
    print("\(label): \(ContinuousClock.now - start)")
    return result
}
```

现在整个函数在调用者的执行器上运行。从 MainActor 调用,它就留在 MainActor 上。从自定义 actor 调用,它就留在那里。闭包从不跨越隔离边界,所以不需要 Sendable 检查。

<div class="tip">
<h4>何时使用哪种方法</h4>

**`nonisolated(nonsending)`** - 简单的选择。只需添加属性。当你只需要留在调用者的执行器上时使用。

**`isolation: isolated (any Actor)? = #isolation`** - 显式的选择。添加一个参数,让你可以访问 actor 实例。当你需要将隔离上下文传递给其他函数或检查你在哪个 actor 上时使用。
</div>

如果你确实需要显式访问 actor,使用 [`#isolation`](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/expressions/#Isolation-Expression) 参数:

```swift
func measure<T>(
    isolation: isolated (any Actor)? = #isolation,
    _ label: String,
    block: () async throws -> T
) async rethrows -> T {
    let start = ContinuousClock.now
    let result = try await block()
    print("\(label): \(ContinuousClock.now - start)")
    return result
}
```

这两种方法对于构建使用起来自然的 async 工具都是必不可少的。没有它们,调用者需要让他们的闭包成为 `@Sendable` 或者费尽周折来满足编译器。

<div class="analogy">
<h4>在楼里走动</h4>

当你在前台办公室(MainActor),你叫人来帮你,他们来到*你的*办公室。他们继承你的位置。如果你创建一个 task("帮我做这个"),那个助手也从你的办公室开始。

唯一让某人最终在不同办公室的方式是他们显式去那里:"我需要在会计部门做这件事"(`actor`),或"我在后台办公室处理这个"(`@concurrent`)。
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [融会贯通](#putting-it-together)

让我们退后一步,看看所有部分如何配合。

Swift 并发感觉像很多概念:`async/await`、`Task`、actors、`MainActor`、`Sendable`、隔离域。但其实中心只有一个想法:**隔离默认被继承。**

启用 [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) 后,你的应用从 [`MainActor`](https://developer.apple.com/documentation/swift/mainactor) 开始。这是你的起点。从那里:

- 你调用的每个函数**继承**那个隔离
- 你创建的每个闭包**捕获**那个隔离
- 你生成的每个 [`Task { }`](https://developer.apple.com/documentation/swift/task) **继承**那个隔离

你不需要标注任何东西。你不需要考虑线程。你的代码在 `MainActor` 上运行,隔离自动传播到你的程序中。

当你需要打破这种继承时,你显式地做:

- **`@concurrent`** 表示"在后台线程运行这个"
- **`actor`** 表示"这个类型有自己的隔离域"
- **`Task.detached { }`** 表示"重新开始,什么都不继承"

当你在隔离域之间传递数据时,Swift 检查是否安全。这就是 [`Sendable`](https://developer.apple.com/documentation/swift/sendable) 的作用:标记可以安全跨边界的类型。

就这样。这就是整个模型:

1. **隔离从 `MainActor` 传播**通过你的代码
2. **你显式选择退出**当你需要后台工作或独立状态时
3. **Sendable 守卫边界**当数据跨域时

当编译器抱怨时,它在告诉你这些规则之一被违反了。追踪继承:隔离从哪里来?代码想在哪里运行?什么数据在跨边界?一旦你问对了问题,答案通常很明显。

### 接下来去哪里

好消息:你不需要一次掌握所有东西。

**大多数应用只需要基础。** 用 `@MainActor` 标记你的 ViewModel,用 `async/await` 做网络调用,当你需要从按钮点击启动异步工作时创建 `Task { }`。就这样。这处理了 80% 的实际应用。编译器会告诉你是否需要更多。

**当你需要并行工作时**,用 `async let` 一次获取多个东西,或当任务数量是动态的时用 [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup)。学会优雅地处理取消。这涵盖了有复杂数据加载或实时功能的应用。

**高级模式以后再说**,如果需要的话。为共享可变状态用自定义 actors,为 CPU 密集型处理用 `@concurrent`,深入理解 `Sendable`。这是框架代码、服务器端 Swift、复杂桌面应用。大多数开发者永远不需要这个级别。

<div class="tip">
<h4>从简单开始</h4>

不要为你没有的问题优化。从基础开始,发布你的应用,只有遇到真正的问题时才增加复杂性。编译器会指导你。
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [注意:常见错误](#mistakes)

### 认为 async = 后台

```swift
// 这仍然阻塞主线程!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // 同步工作 = 阻塞
    data = result
}
```

`async` 意思是"可以暂停"。实际工作仍然在它运行的地方运行。用 `@concurrent`(Swift 6.2)或 `Task.detached` 做 CPU 密集型工作。

### 创建太多 actors

```swift
// 过度工程
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// 更好——大多数东西可以在 MainActor 上
@MainActor
class AppState { }
```

只有当你有不能在 `MainActor` 上的共享可变状态时才需要自定义 actor。[Matt Massicotte 的规则](https://www.massicotte.org/actors/):只有当 (1) 你有 non-`Sendable` 状态,(2) 对该状态的操作必须是原子的,且 (3) 这些操作不能在现有 actor 上运行时才引入 actor。如果你无法证明合理性,就用 `@MainActor`。

### 让所有东西都 Sendable

不是所有东西都需要跨边界。如果你到处加 `@unchecked Sendable`,退后一步问问数据是否真的需要在隔离域之间移动。

### 不必要地使用 MainActor.run

```swift
// 不必要
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// 更好——直接让函数 @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` 很少是正确的解决方案。如果你需要 MainActor 隔离,用 `@MainActor` 标注函数。更清晰,编译器能更好地帮助你。看看 [Matt 对此的看法](https://www.massicotte.org/problematic-patterns/)。

### 阻塞协作线程池

```swift
// 永远不要这样做——有死锁风险
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // 阻塞了协作线程!
}
```

Swift 的协作线程池线程数有限。用 `DispatchSemaphore`、`DispatchGroup.wait()` 或类似调用阻塞一个可能导致死锁。如果你需要桥接同步和异步代码,用 `async let` 或重构为完全异步。

<div id="managedtasks">

### 创建不受管理的任务

你用 `Task { ... }` 或 `Task.detached { ... }` 手动创建的任务是不受管理的。创建不受管理的任务后,你无法控制它们。如果启动它们的任务被取消,你无法取消它们。你无法知道它们是否完成了工作,是否抛出了错误,或收集它们的返回值。启动这样的任务就像把瓶子扔进大海,希望它能把信息传递到目的地,再也看不到那个瓶子了。

<div class="analogy">
<h4>办公楼</h4>

`Task` 就像给员工分配工作。员工处理请求(包括等待其他办公室),而你继续你的即时工作。

给员工派遣工作后,你没有办法与她沟通。你不能告诉她停止工作,也不知道她是否完成了以及那项工作的结果是什么。

你真正想要的是给员工一个对讲机,这样在她处理请求时你可以与她沟通。有了对讲机,你可以告诉她停下来,或者她可以在遇到错误时告诉你,或者她可以报告你给她的请求的结果。
</div>

不要创建不受管理的任务,而是使用 Swift 并发来保持对你创建的子任务的控制。使用 `TaskGroup` 来管理(一组)子任务。Swift 提供了几个 `withTaskGroup() { group in ... }` 函数来帮助创建任务组。

```swift
func doWork() async {

    // 这将在所有子任务返回、抛出错误或被取消时返回
    let result = try await withThrowingTaskGroup() { group in
        group.addTask {
            try await self.performAsyncOperation1()
        }
        group.addTask {
            try await self.performAsyncOperation2()
        }
        // 在这里等待并收集任务的结果
    }
}

func performAsyncOperation1() async throws -> Int {
    return 1
}
func performAsyncOperation2() async throws -> Int {
    return 2
}
```

要收集组的子任务结果,可以使用 for-await-in 循环:

```swift
var sum = 0
for await result in group {
    sum += result
}
// sum == 3
```

你可以在 Swift 文档中了解更多关于 [TaskGroup](https://developer.apple.com/documentation/swift/taskgroup) 的信息。

#### 关于 Tasks 和 SwiftUI 的说明

编写 UI 时,你经常想从同步上下文启动异步任务。例如,你想在响应 UI 元素的点击时异步加载图像。在 Swift 中无法从同步上下文启动异步任务。这就是为什么你会看到涉及 `Task { ... }` 的解决方案,这引入了不受管理的任务。

你不能从 SwiftUI 的同步修饰符使用 `TaskGroup`,因为 `withTaskGroup()` 也是一个 async 函数,它的相关函数也是如此。

作为替代,SwiftUI 提供了一个异步修饰符,你可以用它来启动异步操作。我们已经提到的 `.task { }` 修饰符接受一个 `() async -> Void` 函数,非常适合调用其他 `async` 函数。它在每个 `View` 上都可用。它在视图出现之前触发,它创建的任务被管理并绑定到视图的生命周期,这意味着当视图消失时任务会被取消。

回到点击加载图像的例子:不要创建一个不受管理的任务来从同步的 `.onTap() { ... }` 函数调用异步的 `loadImage()` 函数,你可以在点击手势时切换一个标志,并使用 `task(id:)` 修饰符在 `id`(标志)的值改变时异步加载图像。

这是一个例子:

```swift
struct ContentView: View {

    @State private var shouldLoadImage = false

    var body: some View {
        Button("点击这里!") {
            // 切换标志
            shouldLoadImage = !shouldLoadImage
        }
        // View 管理子任务
        // 它在视图显示之前启动
        // 并在视图隐藏时停止
        .task(id: shouldLoadImage) {
            // 当标志的值改变时,SwiftUI 重新启动任务
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

## [速查表:快速参考](#glossary)

| 关键字 | 作用 |
|---------|--------------|
| `async` | 函数可以暂停 |
| `await` | 在这里暂停直到完成 |
| `Task { }` | 启动异步工作,继承上下文 |
| `Task.detached { }` | 启动异步工作,不继承上下文 |
| `@MainActor` | 在主线程运行 |
| `actor` | 带隔离可变状态的类型 |
| `nonisolated` | 退出 actor 隔离 |
| `nonisolated(nonsending)` | 保持在调用者的执行器上 |
| `Sendable` | 可以安全跨隔离域传递 |
| `@concurrent` | 总是在后台运行(Swift 6.2+) |
| `#isolation` | 将调用者的隔离捕获为参数 |
| `async let` | 开始并行工作 |
| `TaskGroup` | 动态并行工作 |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [延伸阅读](#further-reading)

<div class="resources">
<h4>Matt Massicotte 的博客(强烈推荐)</h4>

- [Swift 并发术语表](https://www.massicotte.org/concurrency-glossary) - 基本术语
- [隔离简介](https://www.massicotte.org/intro-to-isolation/) - 核心概念
- [何时应该使用 actor?](https://www.massicotte.org/actors/) - 实用指导
- [Non-Sendable 类型也很酷](https://www.massicotte.org/non-sendable/) - 为什么更简单更好
</div>

<div class="resources">
<h4>官方 Apple 资源</h4>

- [Swift 并发文档](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: 认识 async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: 用 actors 保护可变状态](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>工具</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) - 让大型团队和代码库开发更快
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [AI 代理技能](#ai-skill)

想让你的 AI 编程助手理解 Swift Concurrency？我们提供一个 **[SKILL.md](/SKILL.md)** 文件，为 Claude Code、Codex、Amp、OpenCode 等 AI 代理打包了这些心智模型。

### 其他技能

- <a href="https://github.com/AvdLee/Swift-Concurrency-Agent-Skill" target="_blank" rel="noreferrer noopener">Antoine 开源的 Swift Concurrency Agent Skill</a>

<div class="tip">
<h4>什么是技能？</h4>

技能是一个 markdown 文件，用于向 AI 编程代理教授专业知识。当你将 Swift Concurrency 技能添加到代理时，它会在帮助你编写异步 Swift 代码时自动应用这些概念。
</div>

### 如何使用

选择你的代理并运行命令：

<div class="code-tabs">
  <div class="code-tabs-nav">
    <button class="active">Claude Code</button>
    <button>Codex</button>
    <button>Amp</button>
    <button>OpenCode</button>
  </div>
  <div class="code-tab-content active">

```bash
# 个人技能（所有项目）
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# 项目技能（仅此项目）
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# 全局指令（所有项目）
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# 项目指令（仅此项目）
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# 项目指令（推荐）
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# 全局规则（所有项目）
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# 项目规则（仅此项目）
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

该技能包含办公大楼比喻、隔离模式、Sendable 指南、常见错误和快速参考表。当你处理 Swift Concurrency 代码时，代理会自动使用这些知识。

  </div>
</section>
