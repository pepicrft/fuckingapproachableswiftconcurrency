---
layout: base.njk
title: 該死的易懂 Swift 並發
description: Swift 並發的直白指南。用簡單的心智模型學習 async/await、actors、Sendable 和 MainActor。沒有術語，只有清晰的解釋。
lang: zh-TW
dir: ltr
nav:
  async-await: Async/Await
  tasks: Tasks
  execution: 隔離
  sendable: Sendable
  putting-it-together: 總結
  mistakes: 陷阱
footer:
  madeWith: 用挫折和愛製作。因為 Swift 並發不必令人困惑。
  tradition: 承襲以下傳統
  traditionAnd: 和
  viewOnGitHub: 在 GitHub 上查看
---

<section class="hero">
  <div class="container">
    <h1>該死的易懂<br><span class="accent">Swift 並發</span></h1>
    <p class="subtitle">終於能理解 async/await、Tasks，以及為什麼編譯器一直對你吼叫。</p>
    <p class="credit">非常感謝 <a href="https://www.massicotte.org/">Matt Massicotte</a> 讓 Swift 並發變得易懂。由 <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist</a> 共同創辦人 <a href="https://pepicrft.me">Pedro Piñera</a> 整理。發現問題？<a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/issues/new">開啟 Issue</a> 或 <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/pulls">提交 PR</a>。</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [非同步程式碼：async/await](#async-await)

App 做的大多數事情就是等待。從伺服器取得資料——等待回應。從磁碟讀取檔案——等待位元組。查詢資料庫——等待結果。

在 Swift 的並發系統出現之前，你會用 callbacks、delegates 或 [Combine](https://developer.apple.com/documentation/combine) 來表達這種等待。它們可以用，但巢狀的 callbacks 很難追蹤，而 Combine 的學習曲線很陡。

`async/await` 給了 Swift 一種處理等待的新方式。不再用 callbacks，你寫的程式碼看起來是循序的——它暫停、等待、然後繼續。在底層，Swift 的執行時期有效率地管理這些暫停。但要讓你的 app 在等待時真正保持響應，取決於程式碼*在哪裡*執行，這我們稍後會講。

一個 **async 函式**是一個可能需要暫停的函式。你用 `async` 標記它，當你呼叫它時，你用 `await` 來說「在這裡暫停直到它完成」：

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // 在這裡掛起
    return try JSONDecoder().decode(User.self, from: data)
}

// 呼叫它
let user = try await fetchUser(id: 123)
// 這裡的程式碼在 fetchUser 完成後執行
```

你的程式碼在每個 `await` 處暫停——這叫做**掛起**。當工作完成時，你的程式碼就從剛才停下的地方繼續。掛起給了 Swift 在等待時做其他工作的機會。

### 等待*它們*

如果你需要取得好幾個東西怎麼辦？你可以一個一個 await：

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

但這樣很慢——每個都要等前一個完成。用 `async let` 讓它們並行執行：

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // 三個都在並行取得！
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

每個 `async let` 會立即開始。`await` 收集結果。

<div class="tip">
<h4>await 需要 async</h4>

你只能在 `async` 函式裡面使用 `await`。
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [管理工作：Tasks](#tasks)

一個 **[Task](https://developer.apple.com/documentation/swift/task)** 是你可以管理的非同步工作單位。你已經寫了 async 函式，但 Task 才是真正執行它們的東西。它是你從同步程式碼啟動非同步程式碼的方式，而且它讓你可以控制那個工作：等待結果、取消它，或讓它在背景執行。

假設你正在建立一個個人資料畫面。用 [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)) 修飾器在 view 出現時載入頭像，當 view 消失時它會自動取消：

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task { avatar = await downloadAvatar() }
    }
}
```

如果使用者可以切換不同的個人資料，用 `.task(id:)` 在選擇改變時重新載入：

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

當使用者點擊「儲存」，手動建立一個 Task：

```swift
Button("Save") {
    Task { await saveProfile() }
}
```

### 存取 Task 結果

當你建立一個 Task 時，會得到一個句柄。使用 `.value` 來等待並取得結果：

```swift
let handle = Task {
    return await fetchUserData()
}
let userData = await handle.value  // 暫停直到任務完成
```

當你需要稍後取得結果，或者想要儲存任務句柄並在其他地方 await 它時，這很有用。

如果你需要同時載入頭像、簡介和統計資料怎麼辦？用 [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) 並行取得它們：

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

群組裡的 Tasks 是**子任務**，連結到父任務。有幾件事要知道：

- **取消會傳播**：取消父任務，所有子任務也會被取消
- **錯誤**：拋出的錯誤會取消兄弟任務並重新拋出，但只有在你用 `next()`、`waitForAll()` 或迭代來消費結果時
- **完成順序**：結果是按任務完成的順序到達，不是你加入它們的順序
- **等待所有**：群組不會返回，直到每個子任務完成或被取消

這就是**[結構化並發](https://developer.apple.com/videos/play/wwdc2021/10134/)**：工作組織成一棵樹，容易理解和清理。

  </div>
</section>

<section id="execution">
  <div class="container">

## [程式碼在哪裡執行：從執行緒到隔離域](#execution)

到目前為止我們談了程式碼*什麼時候*執行（async/await）和*怎麼組織*它（Tasks）。現在：**它在哪裡執行，我們怎麼保持它安全？**

<div class="tip">
<h4>大多數 app 只是在等待</h4>

大多數 app 程式碼是 **I/O 密集型**的。你從網路取得資料，*await* 回應，解碼它，然後顯示它。如果你有多個 I/O 操作要協調，你就用*任務*和*任務群組*。實際的 CPU 工作很少。主執行緒可以處理得很好，因為 `await` 掛起而不是阻塞。

但遲早，你會有 **CPU 密集型**的工作：解析一個巨大的 JSON 檔案、處理圖片、執行複雜的計算。這種工作不等待任何外部的東西。它只需要 CPU 週期。如果你在主執行緒上執行它，你的 UI 會凍住。這就是「程式碼在哪裡執行」真正重要的時候。
</div>

### 舊世界：很多選擇，沒有安全性

在 Swift 的並發系統出現之前，你有好幾種方式來管理執行：

| 方法 | 它做什麼 | 權衡 |
|----------|--------------|-----------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | 直接控制執行緒 | 底層、容易出錯、很少需要 |
| [GCD](https://developer.apple.com/documentation/dispatch) | 用閉包的派遣佇列 | 簡單但沒有取消機制，容易造成執行緒爆炸 |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | 任務依賴、取消、KVO | 更多控制但冗長且笨重 |
| [Combine](https://developer.apple.com/documentation/combine) | 響應式串流 | 很適合事件串流，學習曲線陡峭 |

這些都可以用，但安全性完全靠你自己。如果你忘了派遣到主執行緒，或者兩個佇列同時存取相同的資料，編譯器幫不了你。

### 問題：資料競爭

當兩個執行緒同時存取相同的記憶體，而且至少有一個在寫入時，就會發生[資料競爭](https://developer.apple.com/documentation/xcode/data-races)：

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// 未定義行為：崩潰、記憶體損壞，或錯誤的值
```

資料競爭是未定義行為。它們可以崩潰、損壞記憶體，或默默地產生錯誤的結果。你的 app 在測試時運作正常，然後在生產環境中隨機崩潰。傳統的工具如鎖和信號量有幫助，但它們是手動的而且容易出錯。

<div class="warning">
<h4>並發放大問題</h4>

你的 app 越並發，資料競爭就越可能發生。一個簡單的 iOS app 可能草率的執行緒安全還能過關。一個處理數千個同時請求的網頁伺服器會不斷崩潰。這就是為什麼 Swift 的編譯時安全性在高並發環境中最重要。
</div>

### 轉變：從執行緒到隔離

Swift 的並發模型問一個不同的問題。不是問「這應該在哪個執行緒上執行？」，它問：**「誰被允許存取這個資料？」**

這就是[隔離](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation)。不是手動把工作派遣到執行緒，你宣告資料周圍的邊界。編譯器在建置時強制執行這些邊界，而不是執行時期。

<div class="tip">
<h4>底層原理</h4>

Swift 並發建立在 [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch)（和 GCD 相同的執行時期）之上。不同的是編譯時期層：actors 和隔離由編譯器強制執行，而執行時期在一個限制在你 CPU 核心數量的[合作執行緒池](https://developer.apple.com/videos/play/wwdc2021/10254/)上處理排程。
</div>

### 三個隔離域

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) 是一個[全域 actor](https://developer.apple.com/documentation/swift/globalactor)，代表主執行緒的隔離域。它很特別，因為 UI 框架（UIKit、AppKit、SwiftUI）需要主執行緒存取。

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // 受 MainActor 隔離保護
}
```

當你把某個東西標記為 `@MainActor`，你不是在說「把這個派遣到主執行緒」。你是在說「這屬於主 actor 的隔離域」。編譯器強制執行任何存取它的東西必須在 MainActor 上，或者 `await` 來跨越邊界。

<div class="tip">
<h4>有疑問時，用 @MainActor</h4>

對於大多數 app，用 `@MainActor` 標記你的 ViewModels 是正確的選擇。效能問題通常被誇大了。從這裡開始，只有在你測量到實際問題時才優化。
</div>

**2. Actors**

一個 [actor](https://developer.apple.com/documentation/swift/actor) 保護它自己的可變狀態。它保證一次只有一段程式碼可以存取它的資料：

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // 安全：actor 保證獨佔存取
    }
}

// 從外部，你必須 await 來跨越邊界
await account.deposit(100)
```

**Actors 不是執行緒。** Actor 是一個隔離邊界。Swift 執行時期決定哪個執行緒實際執行 actor 程式碼。你不控制那個，你也不需要。

**3. Nonisolated**

標記為 [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) 的程式碼選擇退出 actor 隔離。它可以從任何地方呼叫而不需要 `await`，但它不能存取 actor 受保護的狀態：

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // 沒有存取 actor 狀態，可以從任何地方安全呼叫
    }
}

let name = account.bankName()  // 不需要 await
```

<div class="tip">
<h4>易於使用的並發：更少摩擦</h4>

[易於使用的並發](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)透過兩個 Xcode 建置設定簡化了心智模型：

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`：除非你另外說明，所有東西都在 MainActor 上執行
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`：`nonisolated` async 函式留在呼叫者的 actor 上，而不是跳到背景執行緒

新的 Xcode 26 專案預設兩者都啟用。當你需要在主執行緒外進行 CPU 密集型工作時，用 `@concurrent`。

<pre><code class="language-swift">// 在 MainActor 上執行（預設）
func updateUI() async { }

// 在背景執行緒上執行（選擇加入）
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>辦公大樓</h4>

把你的 app 想像成一棟辦公大樓。每個**隔離域**是一間私人辦公室，門上有鎖。一次只有一個人可以在裡面工作，處理那間辦公室的文件。

- **`MainActor`** 是前台——所有客戶互動發生的地方。只有一個，它處理使用者看到的一切。
- **`actor`** 類型是部門辦公室——會計、法務、人資。每個保護自己的敏感文件。
- **`nonisolated`** 程式碼是走廊——任何人都可以走過的共享空間，但沒有私人文件在那裡。

你不能就這樣闖入別人的辦公室。你敲門（`await`）然後等他們讓你進去。
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [什麼可以跨越隔離域：Sendable](#sendable)

隔離域保護資料，但最終你需要在它們之間傳遞資料。當你這樣做時，Swift 會檢查這樣做是否安全。

想一想：如果你把一個可變 class 的參照從一個 actor 傳遞到另一個，兩個 actor 可能同時修改它。這正是我們要防止的資料競爭。所以 Swift 需要知道：這個資料可以安全地共享嗎？

答案是 [`Sendable`](https://developer.apple.com/documentation/swift/sendable) 協定。它是一個標記，告訴編譯器「這個類型可以安全地跨越隔離邊界傳遞」：

- **Sendable** 類型可以安全地跨越（值類型、不可變資料、actors）
- **Non-Sendable** 類型不行（有可變狀態的 classes）

```swift
// Sendable——它是值類型，每個地方都得到一份拷貝
struct User: Sendable {
    let id: Int
    let name: String
}

// Non-Sendable——它是有可變狀態的 class
class Counter {
    var count = 0  // 兩個地方修改這個 = 災難
}
```

### 讓類型 Sendable

Swift 對許多類型自動推斷 `Sendable`：

- 只有 `Sendable` 屬性的 **Structs 和 enums** 隱式是 `Sendable`
- **Actors** 永遠是 `Sendable`，因為它們保護自己的狀態
- **`@MainActor` 類型** 是 `Sendable`，因為 MainActor 序列化存取

對於 classes，就比較難了。一個 class 只有在它是 `final` 且所有儲存的屬性都不可變時，才能符合 `Sendable`：

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // 不可變
    let timeout: Double   // 不可變
}
```

如果你有一個通過其他方式（鎖、atomics）執行緒安全的 class，你可以用 [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable) 告訴編譯器「相信我」：

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable 是一個承諾</h4>

編譯器不會驗證執行緒安全性。如果你錯了，你會得到資料競爭。謹慎使用。
</div>

<div class="tip">
<h4>易於使用的並發：更少摩擦</h4>

有了[易於使用的並發](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)，Sendable 錯誤變得少很多：

- 如果程式碼不跨越隔離邊界，你不需要 Sendable
- Async 函式留在呼叫者的 actor 上，而不是跳到背景執行緒
- 編譯器更聰明地偵測值何時被安全使用

把 `SWIFT_DEFAULT_ACTOR_ISOLATION` 設為 `MainActor` 並把 `SWIFT_APPROACHABLE_CONCURRENCY` 設為 `YES` 來啟用。新的 Xcode 26 專案預設兩者都啟用。當你確實需要並行時，標記函式 `@concurrent` 然後再考慮 Sendable。
</div>

<div class="analogy">
<h4>影印本 vs. 原始文件</h4>

回到辦公大樓。當你需要在部門之間共享資訊時：

- **影印本是安全的**——如果法務部複印一份文件發給會計部，兩者都有自己的副本。他們可以在上面塗寫、修改、隨便怎樣。沒有衝突。
- **原始簽署的合約必須留在原地**——如果兩個部門都可以修改原件，就會陷入混亂。誰有真正的版本？

`Sendable` 類型就像影印本：可以安全共享，因為每個地方都得到自己獨立的副本（值類型）或因為它們不可變（沒人可以修改它們）。Non-`Sendable` 類型就像原始合約：傳遞它們會產生衝突修改的可能性。
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [隔離如何繼承](#isolation-inheritance)

你已經看到隔離域保護資料，而 Sendable 控制什麼可以在它們之間跨越。但程式碼一開始是怎麼進入一個隔離域的？

當你呼叫一個函式或建立一個閉包時，隔離會流過你的程式碼。有了[易於使用的並發](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)，你的 app 從 [`MainActor`](https://developer.apple.com/documentation/swift/mainactor) 開始，那個隔離會傳播到你呼叫的程式碼，除非有東西明確改變它。理解這個流動幫助你預測程式碼在哪裡執行，以及為什麼編譯器有時會抱怨。

### 函式呼叫

當你呼叫一個函式時，它的隔離決定它在哪裡執行：

```swift
@MainActor func updateUI() { }      // 永遠在 MainActor 上執行
func helper() { }                    // 繼承呼叫者的隔離
@concurrent func crunch() async { }  // 明確在 actor 外執行
```

有了[易於使用的並發](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)，你大部分的程式碼繼承 `MainActor` 隔離。函式在呼叫者執行的地方執行，除非它明確選擇退出。

### 閉包

閉包從它們被定義的上下文繼承隔離：

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // 從 ViewModel 繼承 MainActor
            self.updateUI()  // 安全，相同的隔離
        }
        closure()
    }
}
```

這就是為什麼 SwiftUI 的 `Button` action 閉包可以安全地更新 `@State`：它們從 view 繼承 MainActor 隔離。

### Tasks

一個 `Task { }` 從它被建立的地方繼承 actor 隔離：

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // 繼承 MainActor 隔離
            self.updateUI()  // 安全，不需要 await
        }
    }
}
```

這通常是你想要的。任務在建立它的程式碼相同的 actor 上執行。

### 中斷繼承：Task.detached

有時你想要一個不繼承任何上下文的任務：

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // 沒有 actor 隔離，在合作池上執行
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // 明確跳回來
            }
        }
    }
}
```

<div class="warning">
<h4>Task 和 Task.detached 是反模式</h4>

你用 `Task { ... }` 排程的任務是不受管理的。沒有辦法取消它們或知道它們何時完成，如果它們完成的話。沒有辦法存取它們的回傳值或知道它們是否遇到了錯誤。在大多數情況下，使用由 `.task` 或 `TaskGroup` 管理的任務會更好，[如「常見錯誤」部分所述](#managedtasks)。

[Task.detached 應該是你的最後手段](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929)。分離的任務不繼承優先級、task-local 值或 actor 上下文。如果你需要在主 actor 外進行 CPU 密集型工作，改為把函式標記為 `@concurrent`。
</div>

<div class="analogy">
<h4>走過大樓</h4>

當你在前台辦公室（MainActor），你叫人來幫你，他們來到*你的*辦公室。他們繼承你的位置。如果你建立一個任務（「去幫我做這個」），那個助理也從你的辦公室開始。

唯一讓某人在不同辦公室的方式是他們明確去那裡：「我需要在會計部處理這個」（`actor`），或「我在後面辦公室處理這個」（`@concurrent`）。
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [把所有東西放在一起](#putting-it-together)

讓我們退一步看看所有的片段如何組合在一起。

Swift 並發可能感覺像很多概念：`async/await`、`Task`、actors、`MainActor`、`Sendable`、隔離域。但其實只有一個核心想法：**隔離預設是繼承的**。

有了[易於使用的並發](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)啟用，你的 app 從 [`MainActor`](https://developer.apple.com/documentation/swift/mainactor) 開始。這是你的起點。從那裡：

- 你呼叫的每個函式**繼承**那個隔離
- 你建立的每個閉包**捕獲**那個隔離
- 你產生的每個 [`Task { }`](https://developer.apple.com/documentation/swift/task) **繼承**那個隔離

你不必標註任何東西。你不必思考執行緒。你的程式碼在 `MainActor` 上執行，隔離就自動傳播通過你的程式。

當你需要跳出那個繼承時，你明確地做：

- **`@concurrent`** 說「在背景執行緒上執行這個」
- **`actor`** 說「這個類型有自己的隔離域」
- **`Task.detached { }`** 說「重新開始，不繼承任何東西」

而當你在隔離域之間傳遞資料時，Swift 檢查這樣做是否安全。這就是 [`Sendable`](https://developer.apple.com/documentation/swift/sendable) 的用途：標記可以安全跨越邊界的類型。

就這樣。這就是整個模型：

1. **隔離從 `MainActor` 傳播**通過你的程式碼
2. **你明確選擇退出**當你需要背景工作或獨立的狀態時
3. **Sendable 守護邊界**當資料在域之間跨越時

當編譯器抱怨時，它在告訴你這些規則之一被違反了。追蹤繼承：隔離從哪裡來？程式碼試圖在哪裡執行？什麼資料在跨越邊界？一旦你問對問題，答案通常是顯而易見的。

### 接下來往哪裡

好消息：你不需要一次掌握所有東西。

**大多數 app 只需要基礎。** 用 `@MainActor` 標記你的 ViewModels，用 `async/await` 進行網路呼叫，當你需要從按鈕點擊啟動非同步工作時建立 `Task { }`。就這樣。這處理了 80% 的真實世界 app。編譯器會告訴你是否需要更多。

**當你需要並行工作時**，用 `async let` 同時取得多個東西，或當任務數量是動態的時候用 [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup)。學會優雅地處理取消。這涵蓋了有複雜資料載入或即時功能的 app。

**進階模式以後再說**，如果有需要的話。用自訂 actors 處理共享可變狀態，用 `@concurrent` 處理 CPU 密集型處理，深入理解 `Sendable`。這是框架程式碼、伺服器端 Swift、複雜的桌面 app。大多數開發者永遠不需要這個層級。

<div class="tip">
<h4>從簡單開始</h4>

不要為你沒有的問題優化。從基礎開始，發布你的 app，只有在你遇到真正的問題時才增加複雜度。編譯器會引導你。
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [注意：常見錯誤](#mistakes)

### 認為 async = 背景

```swift
// 這仍然會阻塞主執行緒！
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // 同步工作 = 阻塞
    data = result
}
```

`async` 意味著「可以暫停」。實際的工作仍然在它執行的地方執行。用 `@concurrent`（Swift 6.2）或 `Task.detached` 處理 CPU 密集型工作。

### 建立太多 actors

```swift
// 過度工程化
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// 更好——大多數東西可以放在 MainActor 上
@MainActor
class AppState { }
```

你只有在有不能放在 `MainActor` 上的共享可變狀態時才需要自訂 actor。[Matt Massicotte 的規則](https://www.massicotte.org/actors/)：只有在 (1) 你有非 `Sendable` 狀態，(2) 對那個狀態的操作必須是原子的，而且 (3) 那些操作不能在現有的 actor 上執行時，才引入一個 actor。如果你無法證明它合理，就用 `@MainActor`。

### 讓所有東西都 Sendable

不是所有東西都需要跨越邊界。如果你到處加 `@unchecked Sendable`，退一步問問資料是否真的需要在隔離域之間移動。

### 在不需要時使用 MainActor.run

```swift
// 不必要
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// 更好——直接把函式設為 @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` 很少是正確的解決方案。如果你需要 MainActor 隔離，改為用 `@MainActor` 標註函式。這樣更清楚，編譯器也能更好地幫助你。看看 [Matt 對此的看法](https://www.massicotte.org/problematic-patterns/)。

### 阻塞合作執行緒池

```swift
// 永遠不要這樣做——有死鎖風險
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // 阻塞一個合作執行緒！
}
```

Swift 的合作執行緒池有有限的執行緒。用 `DispatchSemaphore`、`DispatchGroup.wait()` 或類似的呼叫阻塞一個可能造成死鎖。如果你需要橋接同步和非同步程式碼，用 `async let` 或重構以保持完全非同步。

<div id="managedtasks">

### 建立不受管理的任務

你用 `Task { ... }` 或 `Task.detached { ... }` 手動建立的任務是不受管理的。建立不受管理的任務後，你無法控制它們。如果啟動它們的任務被取消，你無法取消它們。你無法知道它們是否完成了工作，是否拋出了錯誤，或收集它們的回傳值。啟動這樣的任務就像把瓶子丟進大海，希望它能把訊息傳遞到目的地，再也看不到那個瓶子了。

<div class="analogy">
<h4>辦公大樓</h4>

`Task` 就像給員工分配工作。員工處理請求（包括等待其他辦公室），而你繼續你的即時工作。

給員工派遣工作後，你沒有辦法與她溝通。你不能告訴她停止工作，也不知道她是否完成了以及那項工作的結果是什麼。

你真正想要的是給員工一個對講機，這樣在她處理請求時你可以與她溝通。有了對講機，你可以告訴她停下來，或者她可以在遇到錯誤時告訴你，或者她可以報告你給她的請求的結果。
</div>

不要建立不受管理的任務，而是使用 Swift 並發來保持對你建立的子任務的控制。使用 `TaskGroup` 來管理（一組）子任務。Swift 提供了幾個 `withTaskGroup() { group in ... }` 函式來幫助建立任務群組。

```swift
func doWork() async {

    // 這將在所有子任務回傳、拋出錯誤或被取消時回傳
    let result = try await withThrowingTaskGroup() { group in
        group.addTask {
            try await self.performAsyncOperation1()
        }
        group.addTask {
            try await self.performAsyncOperation2()
        }
        // 在這裡等待並收集任務的結果
    }
}

func performAsyncOperation1() async throws -> Int {
    return 1
}
func performAsyncOperation2() async throws -> Int {
    return 2
}
```

要收集群組的子任務結果，可以使用 for-await-in 迴圈：

```swift
var sum = 0
for await result in group {
    sum += result
}
// sum == 3
```

你可以在 Swift 文件中了解更多關於 [TaskGroup](https://developer.apple.com/documentation/swift/taskgroup) 的資訊。

#### 關於 Tasks 和 SwiftUI 的說明

撰寫 UI 時，你經常想從同步上下文啟動非同步任務。例如，你想在回應 UI 元素的點擊時非同步載入圖片。在 Swift 中無法從同步上下文啟動非同步任務。這就是為什麼你會看到涉及 `Task { ... }` 的解決方案，這引入了不受管理的任務。

你不能從 SwiftUI 的同步修飾器使用 `TaskGroup`，因為 `withTaskGroup()` 也是一個 async 函式，它的相關函式也是如此。

作為替代，SwiftUI 提供了一個非同步修飾器，你可以用它來啟動非同步操作。我們已經提到的 `.task { }` 修飾器接受一個 `() async -> Void` 函式，非常適合呼叫其他 `async` 函式。它在每個 `View` 上都可用。它在視圖出現之前觸發，它建立的任務被管理並繫結到視圖的生命週期，這意味著當視圖消失時任務會被取消。

回到點擊載入圖片的例子：不要建立一個不受管理的任務來從同步的 `.onTap() { ... }` 函式呼叫非同步的 `loadImage()` 函式，你可以在點擊手勢時切換一個旗標，並使用 `task(id:)` 修飾器在 `id`（旗標）的值改變時非同步載入圖片。

這是一個例子：

```swift
struct ContentView: View {

    @State private var shouldLoadImage = false

    var body: some View {
        Button("點擊這裡！") {
            // 切換旗標
            shouldLoadImage = !shouldLoadImage
        }
        // View 管理子任務
        // 它在視圖顯示之前啟動
        // 並在視圖隱藏時停止
        .task(id: shouldLoadImage) {
            // 當旗標的值改變時，SwiftUI 重新啟動任務
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

## [速查表：快速參考](#glossary)

| 關鍵字 | 它做什麼 |
|---------|--------------|
| `async` | 函式可以暫停 |
| `await` | 在這裡暫停直到完成 |
| `Task { }` | 開始非同步工作，繼承上下文 |
| `Task.detached { }` | 開始非同步工作，沒有繼承的上下文 |
| `@MainActor` | 在主執行緒上執行 |
| `actor` | 有隔離可變狀態的類型 |
| `nonisolated` | 選擇退出 actor 隔離 |
| `Sendable` | 可以在隔離域之間安全傳遞 |
| `@concurrent` | 永遠在背景執行（Swift 6.2+） |
| `async let` | 開始並行工作 |
| `TaskGroup` | 動態並行工作 |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [延伸閱讀](#further-reading)

<div class="resources">
<h4>Matt Massicotte 的部落格（強烈推薦）</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - 必要術語
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - 核心概念
- [When should you use an actor?](https://www.massicotte.org/actors/) - 實用指南
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - 為什麼更簡單更好
</div>

<div class="resources">
<h4>Apple 官方資源</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>工具</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) - 讓大型團隊和程式碼庫開發更快
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [AI 代理技能](#ai-skill)

想讓你的 AI 程式碼助手理解 Swift Concurrency？我們提供一個 **[SKILL.md](/SKILL.md)** 檔案，為 Claude Code、Codex、Amp、OpenCode 等 AI 代理打包了這些心智模型。

<div class="tip">
<h4>什麼是技能？</h4>

技能是一個 markdown 檔案，用於向 AI 程式碼代理教授專業知識。當你將 Swift Concurrency 技能加入代理時，它會在協助你撰寫非同步 Swift 程式碼時自動套用這些概念。
</div>

### 如何使用

選擇你的代理並執行命令：

<div class="code-tabs">
  <div class="code-tabs-nav">
    <button class="active">Claude Code</button>
    <button>Codex</button>
    <button>Amp</button>
    <button>OpenCode</button>
  </div>
  <div class="code-tab-content active">

```bash
# 個人技能（所有專案）
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# 專案技能（僅此專案）
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# 全域指令（所有專案）
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# 專案指令（僅此專案）
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# 專案指令（推薦）
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# 全域規則（所有專案）
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# 專案規則（僅此專案）
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

該技能包含辦公大樓比喻、隔離模式、Sendable 指南、常見錯誤和快速參考表。當你處理 Swift Concurrency 程式碼時，代理會自動使用這些知識。

  </div>
</section>
