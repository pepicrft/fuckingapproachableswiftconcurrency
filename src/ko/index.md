---
layout: base.njk
title: 빌어먹게 쉬운 Swift 동시성
description: Swift 동시성에 대한 솔직한 가이드. 간단한 멘탈 모델로 async/await, actors, Sendable, MainActor를 배우세요. 전문 용어 없이, 명확한 설명만.
lang: ko
dir: ltr
nav:
  async-await: Async/Await
  tasks: Tasks
  execution: 격리
  sendable: Sendable
  putting-it-together: 요약
  mistakes: 함정
footer:
  madeWith: 좌절과 사랑으로 만들었습니다. Swift 동시성이 혼란스러울 필요는 없으니까요.
  tradition: 다음의 전통을 따릅니다
  traditionAnd: 과
  viewOnGitHub: GitHub에서 보기
---

<section class="hero">
  <div class="container">
    <h1>빌어먹게 쉬운<br><span class="accent">Swift 동시성</span></h1>
    <p class="subtitle">드디어 async/await, Tasks, 그리고 왜 컴파일러가 계속 소리 지르는지 이해하세요.</p>
    <p class="credit"><a href="https://www.massicotte.org/">Matt Massicotte</a>에게 큰 감사를 드립니다. Swift 동시성을 이해할 수 있게 만들어주셨습니다. <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist</a>의 공동 창립자 <a href="https://pepicrft.me">Pedro Piñera</a>가 정리했습니다. 오류를 발견하셨나요? <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/issues/new">이슈 열기</a> 또는 <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/pulls">PR 제출</a>.</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [비동기 코드: async/await](#async-await)

앱이 하는 일의 대부분은 기다리는 것입니다. 서버에서 데이터 가져오기 - 응답 기다리기. 디스크에서 파일 읽기 - 바이트 기다리기. 데이터베이스 쿼리 - 결과 기다리기.

Swift의 동시성 시스템이 나오기 전에는 콜백, 델리게이트, 또는 [Combine](https://developer.apple.com/documentation/combine)으로 이런 기다림을 표현했습니다. 잘 작동하긴 하지만, 중첩된 콜백은 따라가기 어렵고, Combine은 학습 곡선이 가파릅니다.

`async/await`는 Swift에게 기다림을 처리하는 새로운 방법을 제공합니다. 콜백 대신, 순차적으로 보이는 코드를 작성합니다 - 일시 정지하고, 기다리고, 재개합니다. 내부적으로 Swift의 런타임이 이런 일시 정지를 효율적으로 관리합니다. 하지만 앱이 기다리는 동안 실제로 반응성을 유지하는지는 코드가 *어디서* 실행되는지에 달려 있으며, 이건 나중에 다루겠습니다.

**async 함수**는 일시 정지가 필요할 수 있는 함수입니다. `async`로 표시하고, 호출할 때 `await`를 사용해서 "이게 끝날 때까지 여기서 일시 정지"라고 말합니다:

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // 여기서 정지
    return try JSONDecoder().decode(User.self, from: data)
}

// 호출하기
let user = try await fetchUser(id: 123)
// 여기 코드는 fetchUser가 완료된 후 실행됩니다
```

코드는 각 `await`에서 일시 정지합니다 - 이걸 **정지(suspension)**라고 합니다. 작업이 끝나면, 코드는 멈췄던 바로 그 자리에서 재개됩니다. 정지는 Swift에게 기다리는 동안 다른 작업을 할 기회를 줍니다.

### *여러 개* 기다리기

여러 가지를 가져와야 한다면 어떨까요? 하나씩 await할 수 있습니다:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

하지만 이건 느립니다 - 각각이 이전 것이 끝날 때까지 기다립니다. `async let`을 사용해서 병렬로 실행하세요:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // 세 개 모두 병렬로 가져오고 있습니다!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

각 `async let`은 즉시 시작됩니다. `await`는 결과를 수집합니다.

<div class="tip">
<h4>await에는 async가 필요합니다</h4>

`await`는 `async` 함수 안에서만 사용할 수 있습니다.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [작업 관리: Tasks](#tasks)

**[Task](https://developer.apple.com/documentation/swift/task)**는 관리할 수 있는 비동기 작업 단위입니다. async 함수를 작성했지만, Task가 실제로 그것을 실행하는 것입니다. 동기 코드에서 비동기 코드를 시작하는 방법이며, 그 작업을 제어할 수 있습니다: 결과를 기다리거나, 취소하거나, 백그라운드에서 실행되게 놔둘 수 있습니다.

프로필 화면을 만들고 있다고 해봅시다. 뷰가 나타날 때 아바타를 로드하려면 [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)) 수정자를 사용하세요. 뷰가 사라질 때 자동으로 취소됩니다:

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task { avatar = await downloadAvatar() }
    }
}
```

사용자가 프로필 사이를 전환할 수 있다면, 선택이 변경될 때 다시 로드하려면 `.task(id:)`를 사용하세요:

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

사용자가 "저장"을 탭하면, 수동으로 Task를 만드세요:

```swift
Button("Save") {
    Task { await saveProfile() }
}
```

아바타, 바이오, 통계를 한꺼번에 로드해야 한다면? [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup)을 사용해서 병렬로 가져오세요:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

그룹 안의 Tasks는 **자식 태스크**로, 부모와 연결되어 있습니다. 알아야 할 몇 가지:

- **취소가 전파됩니다**: 부모를 취소하면, 모든 자식도 취소됩니다
- **에러**: 던져진 에러는 형제를 취소하고 다시 던집니다. 하지만 `next()`, `waitForAll()`, 또는 반복으로 결과를 소비할 때만요
- **완료 순서**: 결과는 추가한 순서가 아니라 태스크가 끝나는 순서대로 도착합니다
- **모두 기다림**: 그룹은 모든 자식이 완료되거나 취소될 때까지 반환하지 않습니다

이것이 **[구조화된 동시성](https://developer.apple.com/videos/play/wwdc2021/10134/)**입니다: 트리로 조직된 작업으로 이해하고 정리하기 쉽습니다.

  </div>
</section>

<section id="execution">
  <div class="container">

## [어디서 실행되는가: 스레드에서 격리 도메인으로](#execution)

지금까지 코드가 *언제* 실행되는지 (async/await)와 *어떻게 조직하는지* (Tasks)에 대해 이야기했습니다. 이제: **어디서 실행되고, 어떻게 안전하게 유지하나요?**

<div class="tip">
<h4>대부분의 앱은 그냥 기다립니다</h4>

대부분의 앱 코드는 **I/O 바운드**입니다. 네트워크에서 데이터를 가져오고, 응답을 *await*하고, 디코딩하고, 표시합니다. 조율해야 할 여러 I/O 작업이 있다면, *tasks*와 *task groups*를 사용합니다. 실제 CPU 작업은 최소입니다. `await`가 차단 없이 정지하기 때문에 메인 스레드가 이걸 잘 처리할 수 있습니다.

하지만 언젠가는 **CPU 바운드 작업**이 있을 겁니다: 거대한 JSON 파일 파싱, 이미지 처리, 복잡한 계산 실행. 이 작업은 외부의 무언가를 기다리지 않습니다. 그냥 CPU 사이클이 필요합니다. 메인 스레드에서 실행하면, UI가 멈춥니다. "코드가 어디서 실행되는지"가 실제로 중요해지는 때입니다.
</div>

### 과거: 많은 옵션, 안전 없음

Swift의 동시성 시스템 전에는 실행을 관리하는 여러 방법이 있었습니다:

| 접근 방식 | 하는 일 | 트레이드오프 |
|----------|---------|------------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | 직접 스레드 제어 | 저수준, 에러 발생 쉬움, 거의 필요 없음 |
| [GCD](https://developer.apple.com/documentation/dispatch) | 클로저와 함께 디스패치 큐 | 간단하지만 취소 없음, 스레드 폭발 일으키기 쉬움 |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | 태스크 의존성, 취소, KVO | 더 많은 제어하지만 장황하고 무거움 |
| [Combine](https://developer.apple.com/documentation/combine) | 반응형 스트림 | 이벤트 스트림에 좋음, 가파른 학습 곡선 |

이것들 모두 작동했지만, 안전은 전적으로 여러분에게 달려 있었습니다. 메인으로 디스패치하는 걸 잊거나, 두 큐가 동시에 같은 데이터에 접근해도 컴파일러가 도와줄 수 없었습니다.

### 문제: 데이터 레이스

[데이터 레이스](https://developer.apple.com/documentation/xcode/data-races)는 두 스레드가 동시에 같은 메모리에 접근하고, 적어도 하나가 쓰고 있을 때 발생합니다:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// 정의되지 않은 동작: 크래시, 메모리 손상, 또는 잘못된 값
```

데이터 레이스는 정의되지 않은 동작입니다. 크래시하거나, 메모리를 손상시키거나, 조용히 잘못된 결과를 낼 수 있습니다. 테스트에서는 앱이 잘 작동하다가, 프로덕션에서 무작위로 크래시합니다. 락과 세마포어 같은 전통적인 도구가 도움이 되지만, 수동적이고 에러가 발생하기 쉽습니다.

<div class="warning">
<h4>동시성이 문제를 증폭시킵니다</h4>

앱의 동시성이 높을수록, 데이터 레이스가 발생할 가능성이 높아집니다. 간단한 iOS 앱은 대충 스레드 안전해도 괜찮을 수 있습니다. 수천 개의 동시 요청을 처리하는 웹 서버는 끊임없이 크래시할 것입니다. 이것이 Swift의 컴파일 타임 안전이 고동시성 환경에서 가장 중요한 이유입니다.
</div>

### 전환: 스레드에서 격리로

Swift의 동시성 모델은 다른 질문을 합니다. "이게 어느 스레드에서 실행되어야 하나?" 대신, **"누가 이 데이터에 접근할 수 있나?"**를 묻습니다.

이것이 [격리(isolation)](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation)입니다. 수동으로 스레드에 작업을 디스패치하는 대신, 데이터 주변에 경계를 선언합니다. 컴파일러가 런타임이 아니라 빌드 타임에 이 경계를 강제합니다.

<div class="tip">
<h4>내부 구조</h4>

Swift 동시성은 [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (GCD와 같은 런타임) 위에 구축되었습니다. 차이점은 컴파일 타임 레이어입니다: 액터와 격리가 컴파일러에 의해 강제되고, 런타임은 CPU 코어 수로 제한된 [협력적 스레드 풀](https://developer.apple.com/videos/play/wwdc2021/10254/)에서 스케줄링을 처리합니다.
</div>

### 세 가지 격리 도메인

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor)는 메인 스레드의 격리 도메인을 나타내는 [전역 액터](https://developer.apple.com/documentation/swift/globalactor)입니다. UI 프레임워크(UIKit, AppKit, SwiftUI)가 메인 스레드 접근을 요구하기 때문에 특별합니다.

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // MainActor 격리로 보호됨
}
```

무언가를 `@MainActor`로 표시할 때, "이걸 메인 스레드로 디스패치해라"고 말하는 게 아닙니다. "이건 메인 액터의 격리 도메인에 속한다"고 말하는 겁니다. 컴파일러는 이것에 접근하는 무엇이든 MainActor에 있거나 경계를 넘기 위해 `await`해야 한다고 강제합니다.

<div class="tip">
<h4>확실하지 않으면 @MainActor를 사용하세요</h4>

대부분의 앱에서, ViewModel을 `@MainActor`로 표시하는 것이 올바른 선택입니다. 성능 우려는 보통 과장되어 있습니다. 여기서 시작하고, 실제 문제를 측정한 경우에만 최적화하세요.
</div>

**2. Actors**

[actor](https://developer.apple.com/documentation/swift/actor)는 자신의 가변 상태를 보호합니다. 한 번에 한 코드만 데이터에 접근할 수 있다는 것을 보장합니다:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // 안전: 액터가 배타적 접근을 보장
    }
}

// 외부에서는 경계를 넘기 위해 await해야 합니다
await account.deposit(100)
```

**액터는 스레드가 아닙니다.** 액터는 격리 경계입니다. Swift 런타임이 실제로 어느 스레드가 액터 코드를 실행하는지 결정합니다. 여러분은 그걸 제어하지 않고, 제어할 필요도 없습니다.

**3. Nonisolated**

[`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated)로 표시된 코드는 액터 격리에서 벗어납니다. `await` 없이 어디서나 호출할 수 있지만, 액터의 보호된 상태에 접근할 수 없습니다:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // 액터 상태에 접근하지 않음, 어디서나 호출 안전
    }
}

let name = account.bankName()  // await 필요 없음
```

<div class="tip">
<h4>접근하기 쉬운 동시성: 더 적은 마찰</h4>

[접근하기 쉬운 동시성](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)은 두 가지 Xcode 빌드 설정으로 멘탈 모델을 단순화합니다:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: 다르게 말하지 않으면 모든 것이 MainActor에서 실행됩니다
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: `nonisolated` async 함수는 백그라운드 스레드로 점프하는 대신 호출자의 액터에 머뭅니다

새 Xcode 26 프로젝트는 둘 다 기본으로 활성화되어 있습니다. 메인 스레드에서 벗어난 CPU 집약적 작업이 필요하면 `@concurrent`를 사용하세요.

<pre><code class="language-swift">// MainActor에서 실행됨 (기본값)
func updateUI() async { }

// 백그라운드 스레드에서 실행됨 (옵트인)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>사무실 건물</h4>

앱을 사무실 건물로 생각해보세요. 각 **격리 도메인**은 문에 잠금이 있는 개인 사무실입니다. 한 번에 한 사람만 안에서 그 사무실의 문서를 가지고 작업할 수 있습니다.

- **`MainActor`**는 안내 데스크입니다 - 모든 고객 상호작용이 일어나는 곳. 하나뿐이고, 사용자가 보는 모든 것을 처리합니다.
- **`actor`** 타입은 부서 사무실입니다 - 회계, 법무, 인사. 각각이 자신의 민감한 문서를 보호합니다.
- **`nonisolated`** 코드는 복도입니다 - 누구나 걸어 다닐 수 있는 공유 공간이지만, 개인 문서는 거기 없습니다.

다른 사람 사무실에 그냥 난입할 수 없습니다. 노크(`await`)하고 들여보내줄 때까지 기다립니다.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [격리 도메인을 넘을 수 있는 것: Sendable](#sendable)

격리 도메인이 데이터를 보호하지만, 결국은 그들 사이에 데이터를 전달해야 합니다. 그럴 때 Swift가 안전한지 확인합니다.

생각해보세요: 가변 클래스에 대한 참조를 한 액터에서 다른 액터로 전달하면, 두 액터 모두 동시에 수정할 수 있습니다. 그게 정확히 우리가 방지하려는 데이터 레이스입니다. 그래서 Swift는 알아야 합니다: 이 데이터가 안전하게 공유될 수 있나?

답은 [`Sendable`](https://developer.apple.com/documentation/swift/sendable) 프로토콜입니다. 컴파일러에게 "이 타입은 격리 경계를 넘어 전달하기에 안전합니다"라고 알려주는 마커입니다:

- **Sendable** 타입은 안전하게 넘을 수 있습니다 (값 타입, 불변 데이터, 액터)
- **Non-Sendable** 타입은 넘을 수 없습니다 (가변 상태가 있는 클래스)

```swift
// Sendable - 값 타입이라 각 곳에서 복사본을 받음
struct User: Sendable {
    let id: Int
    let name: String
}

// Non-Sendable - 가변 상태가 있는 클래스
class Counter {
    var count = 0  // 두 곳에서 이걸 수정하면 = 재앙
}
```

### 타입을 Sendable로 만들기

Swift는 많은 타입에 대해 `Sendable`을 자동으로 추론합니다:

- **Sendable 속성만 있는 Structs와 enums**는 암묵적으로 `Sendable`입니다
- **Actors**는 자신의 상태를 보호하기 때문에 항상 `Sendable`입니다
- **`@MainActor` 타입**은 MainActor가 접근을 직렬화하기 때문에 `Sendable`입니다

클래스의 경우 더 어렵습니다. 클래스는 `final`이고 모든 저장 속성이 불변인 경우에만 `Sendable`을 준수할 수 있습니다:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // 불변
    let timeout: Double   // 불변
}
```

다른 수단(락, 아토믹)을 통해 스레드 안전한 클래스가 있다면, [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable)을 사용해서 컴파일러에게 "나를 믿어"라고 말할 수 있습니다:

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable은 약속입니다</h4>

컴파일러가 스레드 안전을 검증하지 않습니다. 틀리면 데이터 레이스가 발생합니다. 드물게 사용하세요.
</div>

<div class="tip">
<h4>접근하기 쉬운 동시성: 더 적은 마찰</h4>

[접근하기 쉬운 동시성](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)을 사용하면, Sendable 에러가 훨씬 드물어집니다:

- 코드가 격리 경계를 넘지 않으면, Sendable이 필요 없습니다
- Async 함수가 백그라운드 스레드로 호핑하는 대신 호출자의 액터에 머뭅니다
- 컴파일러가 값이 안전하게 사용되는지 감지하는 데 더 똑똑해집니다

`SWIFT_DEFAULT_ACTOR_ISOLATION`을 `MainActor`로, `SWIFT_APPROACHABLE_CONCURRENCY`를 `YES`로 설정해서 활성화하세요. 새 Xcode 26 프로젝트는 둘 다 기본으로 활성화되어 있습니다. 병렬성이 필요할 때 함수를 `@concurrent`로 표시하고 그 다음에 Sendable을 생각하세요.
</div>

<div class="analogy">
<h4>복사본 vs. 원본 문서</h4>

사무실 건물로 돌아가서. 부서 간에 정보를 공유해야 할 때:

- **복사본은 안전합니다** - 법무팀이 문서 복사본을 만들어서 회계에 보내면, 둘 다 자신만의 복사본을 가집니다. 낙서하고, 수정하고, 뭐든지 할 수 있습니다. 충돌 없음.
- **원본 서명된 계약서는 그 자리에 있어야 합니다** - 두 부서가 원본을 수정할 수 있다면, 혼란이 발생합니다. 누가 진짜 버전을 가지고 있나요?

`Sendable` 타입은 복사본 같습니다: 각 곳이 자신만의 독립적인 복사본을 얻거나(값 타입) 불변이기 때문에(아무도 수정할 수 없음) 공유하기에 안전합니다. Non-`Sendable` 타입은 원본 계약서 같습니다: 돌려가며 전달하면 충돌하는 수정의 가능성이 생깁니다.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [격리가 상속되는 방법](#isolation-inheritance)

격리 도메인이 데이터를 보호하고, Sendable이 그들 사이를 넘나드는 것을 제어하는 걸 보셨습니다. 하지만 코드가 처음에 어떻게 격리 도메인에 들어가게 되나요?

함수를 호출하거나 클로저를 생성할 때, 격리가 코드를 통해 흐릅니다. [접근하기 쉬운 동시성](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)에서 앱은 [`MainActor`](https://developer.apple.com/documentation/swift/mainactor)에서 시작하고, 무언가가 명시적으로 변경하지 않는 한 그 격리가 호출하는 코드로 전파됩니다. 이 흐름을 이해하면 코드가 어디서 실행되는지, 왜 컴파일러가 가끔 불평하는지 예측하는 데 도움이 됩니다.

### 함수 호출

함수를 호출할 때, 그 격리가 어디서 실행되는지 결정합니다:

```swift
@MainActor func updateUI() { }      // 항상 MainActor에서 실행
func helper() { }                    // 호출자의 격리 상속
@concurrent func crunch() async { }  // 명시적으로 액터 외부에서 실행
```

[접근하기 쉬운 동시성](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)에서 대부분의 코드는 `MainActor` 격리를 상속합니다. 명시적으로 옵트 아웃하지 않으면 함수는 호출자가 실행되는 곳에서 실행됩니다.

### 클로저

클로저는 정의된 컨텍스트에서 격리를 상속합니다:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // ViewModel에서 MainActor 상속
            self.updateUI()  // 안전, 같은 격리
        }
        closure()
    }
}
```

이것이 SwiftUI의 `Button` 액션 클로저가 `@State`를 안전하게 업데이트할 수 있는 이유입니다: 뷰에서 MainActor 격리를 상속합니다.

### Tasks

`Task { }`는 생성된 곳에서 액터 격리를 상속합니다:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // MainActor 격리 상속
            self.updateUI()  // 안전, await 필요 없음
        }
    }
}
```

이게 보통 원하는 것입니다. 태스크가 생성한 코드와 같은 액터에서 실행됩니다.

### 상속 끊기: Task.detached

가끔 어떤 컨텍스트도 상속하지 않는 태스크가 필요합니다:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // 액터 격리 없음, 협력적 풀에서 실행
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // 명시적으로 다시 돌아옴
            }
        }
    }
}
```

<div class="warning">
<h4>Task와 Task.detached는 안티 패턴입니다</h4>

`Task { ... }`로 스케줄하는 태스크는 관리되지 않습니다. 취소하거나 언제 끝나는지 알 수 있는 방법이 없습니다. 반환 값에 접근하거나 오류가 발생했는지 알 수 있는 방법도 없습니다. 대부분의 경우 `.task`나 `TaskGroup`으로 관리되는 태스크를 사용하는 것이 더 좋습니다. ["흔한 실수" 섹션에서 설명한 대로](#managedtasks).

[Task.detached는 최후의 수단이어야 합니다](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). 분리된 태스크는 우선순위, task-local 값, 액터 컨텍스트를 상속하지 않습니다. 메인 액터에서 벗어난 CPU 집약적 작업이 필요하면 함수를 `@concurrent`로 표시하세요.
</div>

<div class="analogy">
<h4>건물 안에서 걷기</h4>

안내 데스크 사무실(MainActor)에 있을 때, 도와달라고 누군가를 부르면, 그들은 *여러분의* 사무실로 옵니다. 여러분의 위치를 상속합니다. 태스크를 생성하면("나를 위해 이거 해줘"), 그 조수도 여러분의 사무실에서 시작합니다.

누군가가 다른 사무실에 가게 되는 유일한 방법은 명시적으로 거기로 가는 것입니다: "이것을 위해 회계에서 일해야 해" (`actor`), 또는 "뒤 사무실에서 처리할게" (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [모든 것을 합치기](#putting-it-together)

뒤로 물러서서 모든 조각이 어떻게 맞는지 봅시다.

Swift 동시성은 많은 개념처럼 느껴질 수 있습니다: `async/await`, `Task`, 액터, `MainActor`, `Sendable`, 격리 도메인. 하지만 정말 그 중심에는 하나의 아이디어만 있습니다: **격리는 기본적으로 상속됩니다**.

[접근하기 쉬운 동시성](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)이 활성화되면, 앱은 [`MainActor`](https://developer.apple.com/documentation/swift/mainactor)에서 시작합니다. 그게 시작점입니다. 거기서부터:

- 호출하는 모든 함수가 그 격리를 **상속**합니다
- 생성하는 모든 클로저가 그 격리를 **캡처**합니다
- 생성하는 모든 [`Task { }`](https://developer.apple.com/documentation/swift/task)가 그 격리를 **상속**합니다

아무것도 어노테이션할 필요 없습니다. 스레드에 대해 생각할 필요 없습니다. 코드가 `MainActor`에서 실행되고, 격리가 프로그램을 통해 자동으로 전파됩니다.

그 상속에서 벗어나야 할 때, 명시적으로 합니다:

- **`@concurrent`**는 "백그라운드 스레드에서 실행"을 의미합니다
- **`actor`**는 "이 타입은 자신만의 격리 도메인을 가집니다"를 의미합니다
- **`Task.detached { }`**는 "새로 시작, 아무것도 상속하지 않음"을 의미합니다

그리고 격리 도메인 간에 데이터를 전달할 때, Swift가 안전한지 확인합니다. 그게 [`Sendable`](https://developer.apple.com/documentation/swift/sendable)의 역할입니다: 경계를 안전하게 넘을 수 있는 타입을 표시하는 것.

그게 다입니다. 그게 전체 모델입니다:

1. **격리가 전파됩니다** `MainActor`에서 코드를 통해
2. **명시적으로 옵트 아웃합니다** 백그라운드 작업이나 별도의 상태가 필요할 때
3. **Sendable이 경계를 지킵니다** 데이터가 도메인 간에 넘어갈 때

컴파일러가 불평하면, 이 규칙 중 하나가 위반되었다고 말하는 것입니다. 상속을 추적하세요: 격리가 어디서 왔나요? 코드가 어디서 실행되려고 하나요? 어떤 데이터가 경계를 넘고 있나요? 올바른 질문을 하면 답은 보통 명확합니다.

### 여기서 어디로

좋은 소식: 한 번에 모든 것을 마스터할 필요 없습니다.

**대부분의 앱은 기본만 필요합니다.** ViewModel을 `@MainActor`로 표시하고, 네트워크 호출에 `async/await`를 사용하고, 버튼 탭에서 비동기 작업을 시작할 때 `Task { }`를 생성하세요. 그게 다입니다. 그게 실제 앱의 80%를 처리합니다. 더 필요하면 컴파일러가 알려줍니다.

**병렬 작업이 필요할 때**, 여러 가지를 한 번에 가져오려면 `async let`을, 태스크 수가 동적일 때 [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup)을 사용하세요. 취소를 우아하게 처리하는 법을 배우세요. 이건 복잡한 데이터 로딩이나 실시간 기능이 있는 앱을 다룹니다.

**고급 패턴은 나중에**, 필요하다면요. 공유 가변 상태를 위한 커스텀 액터, CPU 집약적 처리를 위한 `@concurrent`, 깊은 `Sendable` 이해. 이건 프레임워크 코드, 서버 사이드 Swift, 복잡한 데스크톱 앱입니다. 대부분의 개발자는 이 수준이 필요 없습니다.

<div class="tip">
<h4>간단하게 시작하세요</h4>

없는 문제에 대해 최적화하지 마세요. 기본으로 시작하고, 앱을 출시하고, 실제 문제에 부딪힐 때만 복잡성을 추가하세요. 컴파일러가 안내해줄 것입니다.
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [주의: 흔한 실수](#mistakes)

### async = 백그라운드라고 생각하기

```swift
// 이것은 여전히 메인 스레드를 차단합니다!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // 동기 작업 = 차단
    data = result
}
```

`async`는 "일시 정지할 수 있다"는 뜻입니다. 실제 작업은 여전히 실행되는 곳에서 실행됩니다. CPU 집약적 작업에는 `@concurrent` (Swift 6.2) 또는 `Task.detached`를 사용하세요.

### 너무 많은 액터 만들기

```swift
// 과도하게 엔지니어링됨
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// 더 나음 - 대부분은 MainActor에 있을 수 있음
@MainActor
class AppState { }
```

`MainActor`에 있을 수 없는 공유 가변 상태가 있을 때만 커스텀 액터가 필요합니다. [Matt Massicotte의 규칙](https://www.massicotte.org/actors/): (1) non-`Sendable` 상태가 있고, (2) 그 상태에 대한 작업이 원자적이어야 하고, (3) 기존 액터에서 실행될 수 없을 때만 액터를 도입하세요. 정당화할 수 없다면, `@MainActor`를 사용하세요.

### 모든 것을 Sendable로 만들기

모든 것이 경계를 넘을 필요는 없습니다. 어디서나 `@unchecked Sendable`을 추가하고 있다면, 뒤로 물러서서 데이터가 정말 격리 도메인 간에 이동해야 하는지 물어보세요.

### 필요 없을 때 MainActor.run 사용하기

```swift
// 불필요함
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// 더 나음 - 함수를 @MainActor로 만들기
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run`은 거의 올바른 해결책이 아닙니다. MainActor 격리가 필요하면, 함수를 `@MainActor`로 어노테이션하세요. 더 명확하고 컴파일러가 더 많이 도와줄 수 있습니다. [Matt의 이에 대한 의견](https://www.massicotte.org/problematic-patterns/)을 보세요.

### 협력적 스레드 풀 차단하기

```swift
// 절대 하지 마세요 - 데드락 위험
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // 협력적 스레드를 차단!
}
```

Swift의 협력적 스레드 풀은 제한된 스레드를 가집니다. `DispatchSemaphore`, `DispatchGroup.wait()`, 또는 비슷한 호출로 하나를 차단하면 데드락이 발생할 수 있습니다. 동기와 비동기 코드를 연결해야 한다면, `async let`을 사용하거나 완전히 비동기로 유지하도록 재구성하세요.

<div id="managedtasks">

### 관리되지 않는 태스크 생성하기

`Task { ... }` 또는 `Task.detached { ... }`로 수동으로 생성하는 태스크는 관리되지 않습니다. 관리되지 않는 태스크를 생성한 후에는 제어할 수 없습니다. 시작한 태스크가 취소되어도 취소할 수 없습니다. 작업이 완료되었는지, 오류를 던졌는지, 반환 값을 수집할 수 없습니다. 이런 태스크를 시작하는 것은 바다에 병을 던지고 메시지가 목적지에 도달하기를 바라는 것과 같습니다. 그 병을 다시 볼 수 없습니다.

<div class="analogy">
<h4>사무실 건물</h4>

`Task`는 직원에게 일을 할당하는 것과 같습니다. 직원은 요청을 처리하고(다른 사무실을 기다리는 것 포함) 여러분은 당장의 일을 계속합니다.

직원에게 일을 보낸 후, 그녀와 소통할 수단이 없습니다. 일을 멈추라고 말하거나 끝났는지, 그 일의 결과가 무엇인지 알 수 없습니다.

정말 원하는 것은 직원에게 무전기를 주어 요청을 처리하는 동안 소통할 수 있게 하는 것입니다. 무전기가 있으면 멈추라고 말할 수 있고, 오류가 발생하면 알려줄 수 있고, 맡긴 요청의 결과를 보고할 수 있습니다.
</div>

관리되지 않는 태스크를 생성하는 대신, Swift 동시성을 사용하여 생성하는 서브태스크의 제어를 유지하세요. `TaskGroup`을 사용하여 (그룹의) 서브태스크를 관리하세요. Swift는 `withTaskGroup() { group in ... }` 함수들을 제공합니다.

```swift
func doWork() async {

    // 모든 서브태스크가 반환하거나, 오류를 던지거나, 취소될 때 반환됩니다
    let result = try await withThrowingTaskGroup() { group in
        group.addTask {
            try await self.performAsyncOperation1()
        }
        group.addTask {
            try await self.performAsyncOperation2()
        }
        // 여기서 태스크 결과를 기다리고 수집합니다
    }
}

func performAsyncOperation1() async throws -> Int {
    return 1
}
func performAsyncOperation2() async throws -> Int {
    return 2
}
```

그룹의 자식 태스크 결과를 수집하려면 for-await-in 루프를 사용할 수 있습니다:

```swift
var sum = 0
for await result in group {
    sum += result
}
// sum == 3
```

[TaskGroup](https://developer.apple.com/documentation/swift/taskgroup)에 대해 더 자세히는 Swift 문서를 참조하세요.

#### 태스크와 SwiftUI에 대한 참고

UI를 작성할 때 동기 컨텍스트에서 비동기 태스크를 시작하고 싶을 때가 많습니다. 예를 들어 UI 요소 터치에 응답하여 비동기적으로 이미지를 로드하고 싶습니다. Swift에서는 동기 컨텍스트에서 비동기 태스크를 시작할 수 없습니다. 그래서 `Task { ... }`를 포함하는 솔루션을 보게 되는데, 이는 관리되지 않는 태스크를 도입합니다.

SwiftUI의 동기 수정자에서 `TaskGroup`을 사용할 수 없습니다. `withTaskGroup()`도 async 함수이고 관련 함수들도 마찬가지입니다.

대안으로 SwiftUI는 비동기 작업을 시작하는 데 사용할 수 있는 비동기 수정자를 제공합니다. 이미 언급한 `.task { }` 수정자는 `() async -> Void` 함수를 받아 다른 `async` 함수를 호출하는 데 이상적입니다. 모든 `View`에서 사용 가능합니다. 뷰가 나타나기 전에 트리거되고 생성하는 태스크는 뷰의 라이프사이클에 관리되고 바인딩되어 뷰가 사라지면 태스크가 취소됩니다.

탭하여 이미지 로드 예제로 돌아가서: 동기 `.onTap() { ... }` 함수에서 비동기 `loadImage()` 함수를 호출하기 위해 관리되지 않는 태스크를 생성하는 대신, 탭 제스처에서 플래그를 토글하고 `task(id:)` 수정자를 사용하여 `id`(플래그) 값이 변경될 때 비동기적으로 이미지를 로드할 수 있습니다.

예제입니다:

```swift
struct ContentView: View {

    @State private var shouldLoadImage = false

    var body: some View {
        Button("클릭하세요!") {
            // 플래그 토글
            shouldLoadImage = !shouldLoadImage
        }
        // View가 서브태스크를 관리합니다
        // 뷰가 표시되기 전에 시작
        // 뷰가 숨겨지면 중지
        .task(id: shouldLoadImage) {
            // 플래그 값이 변경되면 SwiftUI가 태스크를 다시 시작합니다
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

## [치트 시트: 빠른 참조](#glossary)

| 키워드 | 하는 일 |
|--------|---------|
| `async` | 함수가 일시 정지할 수 있음 |
| `await` | 끝날 때까지 여기서 일시 정지 |
| `Task { }` | 비동기 작업 시작, 컨텍스트 상속 |
| `Task.detached { }` | 비동기 작업 시작, 상속된 컨텍스트 없음 |
| `@MainActor` | 메인 스레드에서 실행 |
| `actor` | 격리된 가변 상태를 가진 타입 |
| `nonisolated` | 액터 격리에서 옵트 아웃 |
| `Sendable` | 격리 도메인 간에 안전하게 전달 가능 |
| `@concurrent` | 항상 백그라운드에서 실행 (Swift 6.2+) |
| `async let` | 병렬 작업 시작 |
| `TaskGroup` | 동적 병렬 작업 |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [더 읽을 거리](#further-reading)

<div class="resources">
<h4>Matt Massicotte의 블로그 (강력 추천)</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - 필수 용어
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - 핵심 개념
- [When should you use an actor?](https://www.massicotte.org/actors/) - 실용적인 지침
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - 왜 더 간단한 게 더 나은가
</div>

<div class="resources">
<h4>공식 Apple 리소스</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>도구</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) - 더 큰 팀과 코드베이스로 더 빠르게 개발하세요
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [AI 에이전트 스킬](#ai-skill)

AI 코딩 어시스턴트가 Swift Concurrency를 이해하길 원하시나요? Claude Code, Codex, Amp, OpenCode 등의 AI 에이전트를 위해 이러한 멘탈 모델을 패키징한 **[SKILL.md](/SKILL.md)** 파일을 제공합니다.

<div class="tip">
<h4>스킬이란?</h4>

스킬은 AI 코딩 에이전트에게 전문 지식을 가르치는 마크다운 파일입니다. Swift Concurrency 스킬을 에이전트에 추가하면, 비동기 Swift 코드 작성을 도와줄 때 이러한 개념들을 자동으로 적용합니다.
</div>

### 사용 방법

에이전트를 선택하고 명령어를 실행하세요:

<div class="code-tabs">
  <div class="code-tabs-nav">
    <button class="active">Claude Code</button>
    <button>Codex</button>
    <button>Amp</button>
    <button>OpenCode</button>
  </div>
  <div class="code-tab-content active">

```bash
# 개인 스킬 (모든 프로젝트)
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# 프로젝트 스킬 (이 프로젝트만)
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# 글로벌 지침 (모든 프로젝트)
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# 프로젝트 지침 (이 프로젝트만)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# 프로젝트 지침 (권장)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# 글로벌 규칙 (모든 프로젝트)
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# 프로젝트 규칙 (이 프로젝트만)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

이 스킬에는 오피스 빌딩 비유, 격리 패턴, Sendable 가이드, 흔한 실수, 빠른 참조 표가 포함되어 있습니다. 에이전트가 Swift Concurrency 코드 작업 시 이 지식을 자동으로 활용합니다.

  </div>
</section>
