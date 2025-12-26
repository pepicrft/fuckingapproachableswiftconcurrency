---
layout: base.njk
title: クソ分かりやすい Swift 並行処理
description: Swift 並行処理の嘘偽りないガイド。シンプルなメンタルモデルで async/await、actors、Sendable、MainActor を学ぼう。専門用語なし、明確な説明だけ。
lang: ja
dir: ltr
nav:
  async-await: Async/Await
  tasks: タスク
  execution: 分離
  sendable: Sendable
  putting-it-together: まとめ
  mistakes: 落とし穴
footer:
  madeWith: フラストレーションと愛を込めて作りました。Swift の並行処理が難しい必要はないから。
  viewOnGitHub: GitHub で見る
---

<section class="hero">
  <div class="container">
    <h1>クソ分かりやすい<br><span class="accent">Swift 並行処理</span></h1>
    <p class="subtitle">async/await、Tasks、そしてコンパイラがなぜあなたに怒鳴り続けるのかを、ついに理解しよう。</p>
    <p class="credit"><a href="https://www.massicotte.org/">Matt Massicotte</a> 氏に多大な感謝を。Swift 並行処理を理解可能にしてくれました。<a href="https://pepicrft.me">Pedro Piñera</a> がまとめました。問題を見つけた？ <a href="mailto:pedro@tuist.dev">pedro@tuist.dev</a></p>
    <p class="tribute"><a href="https://fuckingblocksyntax.com/">fuckingblocksyntax.com</a> と <a href="https://fuckingifcaseletsyntax.com/">fuckingifcaseletsyntax.com</a> の伝統を受け継いで</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [非同期コード: async/await](#async-await)

アプリがやることの大半は待つことだ。サーバーからデータを取得する - レスポンスを待つ。ディスクからファイルを読む - バイトを待つ。データベースにクエリする - 結果を待つ。

Swift の並行処理システム以前は、この待機をコールバック、デリゲート、または [Combine](https://developer.apple.com/documentation/combine) で表現していた。動くけど、ネストしたコールバックは追いづらくなるし、Combine は学習曲線がきつい。

`async/await` は Swift に待機を処理する新しい方法を与える。コールバックの代わりに、シーケンシャルに見えるコードを書く - 一時停止し、待ち、再開する。内部では、Swift のランタイムがこれらの一時停止を効率的に管理する。ただし、待っている間にアプリを実際にレスポンシブに保つかどうかは、コードが*どこで*実行されるかに依存する - これは後で説明する。

**async 関数**は一時停止が必要になるかもしれない関数だ。`async` でマークし、呼び出すときは `await` を使って「これが終わるまでここで一時停止」と言う:

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // ここで中断
    return try JSONDecoder().decode(User.self, from: data)
}

// 呼び出し
let user = try await fetchUser(id: 123)
// ここのコードは fetchUser が完了した後に実行される
```

各 `await` でコードは一時停止する - これを**中断**と呼ぶ。作業が終わると、コードは中断した場所から正確に再開する。中断は Swift に待っている間に他の作業をする機会を与える。

### *彼ら*を待つ

複数のものを取得する必要がある場合は？一つずつ await できる:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

でもこれは遅い - 各々が前のものが終わるのを待つ。`async let` を使って並列に実行しよう:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // 3つすべてが並列で取得中！
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

各 `async let` はすぐに開始する。`await` が結果を収集する。

<div class="tip">
<h4>await には async が必要</h4>

`await` は `async` 関数の中でしか使えない。
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [作業の管理: Tasks](#tasks)

**[Task](https://developer.apple.com/documentation/swift/task)** は管理できる非同期作業の単位だ。async 関数を書いてきたけど、Task がそれを実際に実行するものだ。同期コードから非同期コードを開始する方法であり、その作業を制御できる: 結果を待つ、キャンセルする、バックグラウンドで実行させる。

プロフィール画面を作っているとしよう。ビューが表示されたときにアバターを読み込むには、[`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)) モディファイアを使う。ビューが消えると自動的にキャンセルされる:

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task { avatar = await downloadAvatar() }
    }
}
```

ユーザーがプロフィール間を切り替えられる場合は、`.task(id:)` を使って選択が変わったときにリロードする:

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

ユーザーが「保存」をタップしたら、Task を手動で作成する:

```swift
Button("Save") {
    Task { await saveProfile() }
}
```

アバター、自己紹介、統計情報を一度に読み込む必要がある場合は？[`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) を使って並列に取得する:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

グループ内の Task は**子タスク**であり、親にリンクされている。知っておくべきこと:

- **キャンセルは伝播する**: 親をキャンセルすると、すべての子もキャンセルされる
- **エラー**: スローされたエラーは兄弟をキャンセルして再スローするが、`next()`、`waitForAll()`、またはイテレーションで結果を消費したときのみ
- **完了順**: 結果は追加した順ではなく、タスクが完了した順に届く
- **すべてを待つ**: すべての子が完了するかキャンセルされるまでグループは戻らない

これが**[構造化並行処理](https://developer.apple.com/videos/play/wwdc2021/10134/)**だ: 推論しやすくクリーンアップしやすいツリー構造で組織された作業。

  </div>
</section>

<section id="execution">
  <div class="container">

## [どこで実行されるか: スレッドから分離ドメインへ](#execution)

ここまでコードが*いつ*実行されるか（async/await）と*どう組織するか*（Tasks）について話してきた。次は: **どこで実行され、どうやって安全を保つか？**

<div class="tip">
<h4>ほとんどのアプリはただ待っている</h4>

ほとんどのアプリコードは **I/O バウンド**だ。ネットワークからデータを取得し、レスポンスを *await* し、デコードして、表示する。複数の I/O 操作を調整する必要があれば、*tasks* と *task groups* に頼る。実際の CPU 作業は最小限だ。メインスレッドはこれを問題なく処理できる。なぜなら `await` はブロックせずに中断するから。

でも遅かれ早かれ、**CPU バウンド**な作業に出会う: 巨大な JSON ファイルのパース、画像処理、複雑な計算の実行。この作業は外部の何かを待たない。ただ CPU サイクルが必要なだけだ。メインスレッドで実行すると、UI がフリーズする。ここで「コードがどこで実行されるか」が本当に重要になる。
</div>

### 旧世界: 多くの選択肢、安全性なし

Swift の並行処理システム以前は、実行を管理するいくつかの方法があった:

| アプローチ | 何をするか | トレードオフ |
|----------|--------------|-----------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | 直接スレッド制御 | 低レベル、エラーが起きやすい、ほとんど不要 |
| [GCD](https://developer.apple.com/documentation/dispatch) | クロージャ付きディスパッチキュー | シンプルだがキャンセルなし、スレッド爆発を起こしやすい |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | タスク依存関係、キャンセル、KVO | より制御できるが冗長で重い |
| [Combine](https://developer.apple.com/documentation/combine) | リアクティブストリーム | イベントストリームに最適、学習曲線がきつい |

これらはすべて動いたが、安全性は完全に自分次第だった。メインへのディスパッチを忘れたり、二つのキューが同じデータに同時にアクセスしても、コンパイラは助けてくれなかった。

### 問題: データレース

[データレース](https://developer.apple.com/documentation/xcode/data-race)は、二つのスレッドが同じメモリに同時にアクセスし、少なくとも一方が書き込んでいるときに起こる:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// 未定義動作: クラッシュ、メモリ破損、または間違った値
```

データレースは未定義動作だ。クラッシュしたり、メモリを破損したり、静かに間違った結果を生成したりする。テストではアプリが問題なく動き、本番環境でランダムにクラッシュする。ロックやセマフォなどの従来のツールは助けになるが、手動でエラーが起きやすい。

<div class="warning">
<h4>並行処理は問題を増幅する</h4>

アプリの並行度が高いほど、データレースの可能性が高くなる。シンプルな iOS アプリはずさんなスレッドセーフティでも何とかなるかもしれない。何千もの同時リクエストを処理する Web サーバーは常にクラッシュする。これが Swift のコンパイル時安全性が高並行環境で最も重要な理由だ。
</div>

### シフト: スレッドから分離へ

Swift の並行処理モデルは異なる質問をする。「どのスレッドで実行すべきか？」ではなく、**「誰がこのデータにアクセスすることを許可されているか？」**と尋ねる。

これが[分離](https://developer.apple.com/documentation/swift/isolation)だ。手動で作業をスレッドにディスパッチする代わりに、データの周りに境界を宣言する。コンパイラがこれらの境界をランタイムではなくビルド時に強制する。

<div class="tip">
<h4>内部の仕組み</h4>

Swift 並行処理は [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch)（GCD と同じランタイム）の上に構築されている。違いはコンパイル時レイヤーだ: アクターと分離はコンパイラによって強制され、ランタイムは CPU のコア数に制限された[協調スレッドプール](https://developer.apple.com/videos/play/wwdc2021/10254/)でスケジューリングを処理する。
</div>

### 三つの分離ドメイン

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) はメインスレッドの分離ドメインを表す[グローバルアクター](https://developer.apple.com/documentation/swift/globalactor)だ。UI フレームワーク（UIKit、AppKit、SwiftUI）がメインスレッドアクセスを必要とするため、特別だ。

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // MainActor 分離で保護される
}
```

何かを `@MainActor` でマークするとき、「これをメインスレッドにディスパッチする」とは言っていない。「これはメインアクターの分離ドメインに属する」と言っている。コンパイラは、これにアクセスするものは MainActor 上にいるか、境界を越えるために `await` しなければならないことを強制する。

<div class="tip">
<h4>迷ったら @MainActor を使え</h4>

ほとんどのアプリでは、ViewModel に `@MainActor` をマークするのが正しい選択だ。パフォーマンスの懸念は通常大げさだ。ここから始めて、実際に問題を測定した場合のみ最適化しよう。
</div>

**2. Actors**

[actor](https://developer.apple.com/documentation/swift/actor) は自身の可変状態を保護する。一度に一つのコードだけがそのデータにアクセスできることを保証する:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // 安全: アクターが排他的アクセスを保証
    }
}

// 外部からは、境界を越えるために await しなければならない
await account.deposit(100)
```

**アクターはスレッドではない。** アクターは分離境界だ。Swift ランタイムがどのスレッドが実際にアクターコードを実行するかを決定する。それを制御することはできないし、する必要もない。

**3. Nonisolated**

[`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) でマークされたコードはアクター分離をオプトアウトする。`await` なしでどこからでも呼び出せるが、アクターの保護された状態にはアクセスできない:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // アクター状態にアクセスしない、どこからでも呼び出し安全
    }
}

let name = account.bankName()  // await 不要
```

<div class="tip">
<h4>親しみやすい並行処理: 摩擦を減らす</h4>

[親しみやすい並行処理](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html)は2つの Xcode ビルド設定でメンタルモデルをシンプルにする：

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`：他に指定しない限りすべてが MainActor で実行される
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`：`nonisolated` async 関数はバックグラウンドスレッドにジャンプする代わりに呼び出し元のアクターにとどまる

新しい Xcode 26 プロジェクトではデフォルトで両方が有効になっている。メインスレッドから外れた CPU 集約的な作業が必要なときは `@concurrent` を使う。

<pre><code class="language-swift">// MainActor で実行（デフォルト）
func updateUI() async { }

// バックグラウンドスレッドで実行（オプトイン）
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>オフィスビル</h4>

アプリをオフィスビルと考えよう。各**分離ドメイン**はドアにロックがかかったプライベートオフィスだ。一度に一人だけが中に入って、そのオフィスの書類を扱える。

- **`MainActor`** は受付 - すべての顧客対応が行われる場所。一つしかなく、ユーザーが見るすべてを処理する。
- **`actor`** 型は部門オフィス - 経理、法務、人事。それぞれが自分の機密書類を保護する。
- **`nonisolated`** コードは廊下 - 誰でも歩ける共有スペースだが、プライベートな書類はそこにはない。

他人のオフィスに無断で入ることはできない。ノックして（`await`）、入れてもらうのを待つ。
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [分離ドメインを越えられるもの: Sendable](#sendable)

分離ドメインはデータを保護するが、最終的にはドメイン間でデータを渡す必要がある。そうするとき、Swift は安全かどうかをチェックする。

考えてみよう: 可変クラスへの参照をあるアクターから別のアクターに渡すと、両方のアクターが同時にそれを変更できてしまう。まさに防ごうとしているデータレースだ。だから Swift は知る必要がある: このデータは安全に共有できるか？

答えは [`Sendable`](https://developer.apple.com/documentation/swift/sendable) プロトコルだ。コンパイラに「この型は分離境界を越えて渡しても安全」と伝えるマーカーだ:

- **Sendable** 型は安全に越えられる（値型、不変データ、アクター）
- **Non-Sendable** 型は越えられない（可変状態を持つクラス）

```swift
// Sendable - 値型なので、各場所がコピーを得る
struct User: Sendable {
    let id: Int
    let name: String
}

// Non-Sendable - 可変状態を持つクラス
class Counter {
    var count = 0  // 二箇所がこれを変更 = 災害
}
```

### 型を Sendable にする

Swift は多くの型で `Sendable` を自動的に推論する:

- **Sendable プロパティのみを持つ構造体と列挙型**は暗黙的に `Sendable`
- **アクター**は常に `Sendable` - 自身の状態を保護するから
- **`@MainActor` 型**は `Sendable` - MainActor がアクセスを直列化するから

クラスの場合は難しい。クラスが `Sendable` に準拠できるのは、`final` で、すべての格納プロパティが不変の場合のみ:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // 不変
    let timeout: Double   // 不変
}
```

他の手段（ロック、アトミック）でスレッドセーフなクラスがある場合は、[`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable) を使ってコンパイラに「信じて」と伝えられる:

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable は約束だ</h4>

コンパイラはスレッドセーフティを検証しない。間違っていればデータレースになる。控えめに使おう。
</div>

<div class="tip">
<h4>親しみやすい並行処理: 摩擦を減らす</h4>

[親しみやすい並行処理](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html)では、Sendable エラーはずっと少なくなる：

- コードが分離境界を越えないなら、Sendable は不要
- async 関数はバックグラウンドスレッドにホップする代わりに呼び出し元のアクターにとどまる
- コンパイラは値が安全に使われているかの検出が賢くなる

`SWIFT_DEFAULT_ACTOR_ISOLATION` を `MainActor` に、`SWIFT_APPROACHABLE_CONCURRENCY` を `YES` に設定して有効にする。新しい Xcode 26 プロジェクトではデフォルトで両方が有効になっている。並列性が本当に必要なときは、関数を `@concurrent` でマークしてから Sendable について考えよう。
</div>

<div class="analogy">
<h4>コピーと原本</h4>

オフィスビルに戻ろう。部門間で情報を共有する必要があるとき:

- **コピーは安全** - 法務部が書類のコピーを作って経理部に送れば、両方が自分のコピーを持つ。好きなように落書きしたり変更したりできる。衝突なし。
- **署名入りの原本契約はその場にとどまるべき** - 二つの部門が両方とも原本を変更できたら、カオスになる。どれが本物のバージョン？

`Sendable` 型はコピーのようなもの: 各場所が独立したコピーを得る（値型）か、不変である（誰も変更できない）から共有しても安全。Non-`Sendable` 型は原本契約のようなもの: 渡し回すと矛盾する変更の可能性が生まれる。
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [分離がどう継承されるか](#isolation-inheritance)

分離ドメインがデータを保護し、Sendable がその間を越えるものを制御することを見てきた。でも、そもそもコードはどうやって分離ドメインに入るのか？

関数を呼び出したりクロージャを作成したりすると、分離はコードを通じて流れる。[親しみやすい並行処理](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html)では、アプリは [`MainActor`](https://developer.apple.com/documentation/swift/mainactor) から始まり、何かが明示的に変更しない限り、その分離は呼び出すコードに伝播する。このフローを理解することで、コードがどこで実行されるか、なぜコンパイラが時々文句を言うかを予測できる。

### 関数呼び出し

関数を呼び出すと、その分離がどこで実行されるかを決定する:

```swift
@MainActor func updateUI() { }      // 常に MainActor で実行
func helper() { }                    // 呼び出し元の分離を継承
@concurrent func crunch() async { }  // 明示的にオフアクターで実行
```

[親しみやすい並行処理](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html)では、ほとんどのコードが `MainActor` 分離を継承する。関数は呼び出し元がいる場所で実行される - 明示的にオプトアウトしない限り。

### クロージャ

クロージャは定義されたコンテキストから分離を継承する:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // ViewModel から MainActor を継承
            self.updateUI()  // 安全、同じ分離
        }
        closure()
    }
}
```

これが SwiftUI の `Button` アクションクロージャが安全に `@State` を更新できる理由だ: ビューから MainActor 分離を継承している。

### Tasks

`Task { }` は作成された場所からアクター分離を継承する:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // MainActor 分離を継承
            self.updateUI()  // 安全、await 不要
        }
    }
}
```

これは通常望む動作だ。タスクはそれを作成したコードと同じアクターで実行される。

### 継承を断ち切る: Task.detached

コンテキストを何も継承しないタスクが欲しいこともある:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // アクター分離なし、協調プールで実行
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // 明示的に戻る
            }
        }
    }
}
```

<div class="warning">
<h4>Task.detached は通常間違い</h4>

Swift チームは [Task.detached を最後の手段として](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929)推奨している。優先度、タスクローカル値、アクターコンテキストを継承しない。ほとんどの場合、通常の `Task` が必要だ。メインアクターから外れた CPU 集約的な作業が必要なら、代わりに関数を `@concurrent` でマークしよう。
</div>

<div class="analogy">
<h4>ビルを歩く</h4>

受付オフィス（MainActor）にいて、手伝いを呼ぶと、彼らは*あなたの*オフィスに来る。あなたの場所を継承する。タスクを作成すると（「これをやっておいて」）、そのアシスタントもあなたのオフィスから始まる。

誰かが別のオフィスに行くのは、明示的にそこに行く場合だけだ:「このためには経理で作業する必要がある」（`actor`）、または「これは奥のオフィスで処理する」（`@concurrent`）。
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [すべてをまとめる](#putting-it-together)

一歩引いて、すべてのピースがどうフィットするか見てみよう。

Swift 並行処理は多くの概念に感じられる: `async/await`、`Task`、アクター、`MainActor`、`Sendable`、分離ドメイン。でも実際には中心にあるのは一つのアイデアだけだ: **分離はデフォルトで継承される**。

[親しみやすい並行処理](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html)を有効にすると、アプリは [`MainActor`](https://developer.apple.com/documentation/swift/mainactor) から始まる。それが出発点だ。そこから:

- 呼び出すすべての関数がその分離を**継承**する
- 作成するすべてのクロージャがその分離を**キャプチャ**する
- 生成するすべての [`Task { }`](https://developer.apple.com/documentation/swift/task) がその分離を**継承**する

何もアノテートする必要はない。スレッドについて考える必要はない。コードは `MainActor` で実行され、分離はプログラム全体に自動的に伝播する。

その継承から抜け出す必要があるときは、明示的にする:

- **`@concurrent`** は「バックグラウンドスレッドで実行」と言う
- **`actor`** は「この型は独自の分離ドメインを持つ」と言う
- **`Task.detached { }`** は「ゼロから始める、何も継承しない」と言う

そして分離ドメイン間でデータを渡すとき、Swift は安全かチェックする。それが [`Sendable`](https://developer.apple.com/documentation/swift/sendable) の役割だ: 境界を安全に越えられる型をマークする。

それだけだ。モデル全体:

1. **分離は伝播する** - `MainActor` からコードを通じて
2. **明示的にオプトアウトする** - バックグラウンド作業や別の状態が必要なとき
3. **Sendable が境界を守る** - データがドメイン間を越えるとき

コンパイラが文句を言うとき、これらのルールのどれかが違反されたと伝えている。継承をトレースしよう: 分離はどこから来た？コードはどこで実行しようとしている？どんなデータが境界を越えている？正しい質問をすれば答えは通常明らかだ。

### ここからどこへ

良いニュース: すべてを一度にマスターする必要はない。

**ほとんどのアプリは基本だけで十分だ。** ViewModel に `@MainActor` をマークし、ネットワーク呼び出しに `async/await` を使い、ボタンタップから非同期作業を開始するときに `Task { }` を作成する。それだけだ。これが現実のアプリの 80% をカバーする。コンパイラがもっと必要か教えてくれる。

**並列作業が必要なとき**は、複数のものを一度に取得するために `async let` を使うか、タスク数が動的な場合は [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) を使う。キャンセルを優雅に処理することを学ぼう。これが複雑なデータ読み込みやリアルタイム機能を持つアプリをカバーする。

**高度なパターンは後で**来る - もし来るなら。共有可変状態のためのカスタムアクター、CPU 集約的処理のための `@concurrent`、深い `Sendable` の理解。これはフレームワークコード、サーバーサイド Swift、複雑なデスクトップアプリだ。ほとんどの開発者はこのレベルを必要としない。

<div class="tip">
<h4>シンプルに始める</h4>

持っていない問題のために最適化するな。基本から始め、アプリを出荷し、実際の問題にぶつかったときだけ複雑さを追加しよう。コンパイラが導いてくれる。
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [注意: よくある間違い](#mistakes)

### async = バックグラウンドと思う

```swift
// これはまだメインスレッドをブロックする！
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // 同期作業 = ブロック
    data = result
}
```

`async` は「一時停止できる」という意味だ。実際の作業はそれが実行される場所で実行される。CPU 重い作業には `@concurrent`（Swift 6.2）か `Task.detached` を使おう。

### アクターを作りすぎる

```swift
// 過剰設計
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// より良い - ほとんどは MainActor で済む
@MainActor
class AppState { }
```

カスタムアクターが必要なのは、`MainActor` に置けない共有可変状態があるときだけだ。[Matt Massicotte のルール](https://www.massicotte.org/actors/): アクターを導入するのは (1) non-`Sendable` な状態があり、(2) その状態への操作がアトミックでなければならず、(3) それらの操作が既存のアクターで実行できない場合のみ。正当化できないなら、代わりに `@MainActor` を使おう。

### すべてを Sendable にする

すべてが境界を越える必要はない。あちこちで `@unchecked Sendable` を追加しているなら、一歩引いてそのデータが本当に分離ドメイン間を移動する必要があるか問おう。

### 必要ないのに MainActor.run を使う

```swift
// 不要
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// より良い - 関数を @MainActor にする
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` が正解なことはまれだ。MainActor 分離が必要なら、代わりに関数に `@MainActor` をアノテートしよう。より明確で、コンパイラがもっと助けてくれる。[Matt のこれについての見解](https://www.massicotte.org/problematic-patterns/)を参照。

### 協調スレッドプールをブロックする

```swift
// 絶対にやるな - デッドロックのリスク
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // 協調スレッドをブロック！
}
```

Swift の協調スレッドプールは限られたスレッドを持つ。`DispatchSemaphore`、`DispatchGroup.wait()` などでブロックするとデッドロックを引き起こす可能性がある。同期と非同期のコードをブリッジする必要があるなら、`async let` を使うか、完全に非同期のままになるように再構成しよう。

### 不要な Task を作る

```swift
// 不要な Task 作成
func fetchAll() async {
    Task { await fetchUsers() }
    Task { await fetchPosts() }
}

// より良い - 構造化並行処理を使う
func fetchAll() async {
    async let users = fetchUsers()
    async let posts = fetchPosts()
    await (users, posts)
}
```

すでに async コンテキストにいるなら、非構造化 `Task` を作るより構造化並行処理（`async let`、`TaskGroup`）を優先しよう。構造化並行処理はキャンセルを自動的に処理し、コードを推論しやすくする。

  </div>
</section>

<section id="glossary">
  <div class="container">

## [チートシート: クイックリファレンス](#glossary)

| キーワード | 何をするか |
|---------|--------------|
| `async` | 関数は一時停止できる |
| `await` | 終わるまでここで一時停止 |
| `Task { }` | 非同期作業を開始、コンテキストを継承 |
| `Task.detached { }` | 非同期作業を開始、コンテキスト継承なし |
| `@MainActor` | メインスレッドで実行 |
| `actor` | 分離された可変状態を持つ型 |
| `nonisolated` | アクター分離をオプトアウト |
| `Sendable` | 分離ドメイン間で渡しても安全 |
| `@concurrent` | 常にバックグラウンドで実行（Swift 6.2+） |
| `async let` | 並列作業を開始 |
| `TaskGroup` | 動的な並列作業 |

## 参考資料

<div class="resources">
<h4>Matt Massicotte のブログ（強く推奨）</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - 必須用語
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - 核心概念
- [When should you use an actor?](https://www.massicotte.org/actors/) - 実用的なガイダンス
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - なぜシンプルが良いか
</div>

<div class="resources">
<h4>公式 Apple リソース</h4>

- [Swift 並行処理ドキュメント](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

  </div>
</section>
