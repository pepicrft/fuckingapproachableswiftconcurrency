---
layout: base.njk
title: До біса зрозумілий Swift Concurrency
description: Прямолінійний посібник зі Swift concurrency. Вивчіть async/await, actors, Sendable і MainActor за допомогою простих ментальних моделей. Без жаргону, лише зрозумілі пояснення.
lang: uk
dir: ltr
nav:
  async-await: Async/Await
  tasks: Завдання
  execution: Ізоляція
  sendable: Sendable
  putting-it-together: Підсумок
  mistakes: Пастки
footer:
  madeWith: Зроблено з фрустрацією і любов'ю. Бо Swift concurrency не мусить бути заплутаною.
  tradition: У традиції
  traditionAnd: та
  viewOnGitHub: Дивитися на GitHub
---

<section class="hero">
  <div class="container">
    <h1>До біса зрозумілий<br><span class="accent">Swift Concurrency</span></h1>
    <p class="subtitle">Нарешті зрозумійте async/await, Tasks і чому компілятор постійно на вас кричить.</p>
    <p class="credit">Величезна подяка <a href="https://www.massicotte.org/">Matt Massicotte</a> за те, що зробив Swift concurrency зрозумілою. Підготував <a href="https://pepicrft.me">Pedro Piñera</a>, співзасновник <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist</a>. Знайшли проблему? <a href="https://github.com/tuist/fuckingapproachableswiftconcurrency/issues/new">Створіть issue</a> або <a href="https://github.com/tuist/fuckingapproachableswiftconcurrency/pulls">надішліть PR</a>.</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [Асинхронний код: async/await](#async-await)

Більшу частину часу застосунки просто чекають. Отримати дані із сервера - чекати на відповідь. Прочитати файл із диска - чекати на байти. Зробити запит до бази даних - чекати на результати.

До появи системи конкурентності Swift ви описували це очікування через callback-и, делегати або [Combine](https://developer.apple.com/documentation/combine). Вони працюють, але вкладені callback-и швидко стають важкими для читання, а в Combine крута крива навчання.

`async/await` дає Swift новий спосіб працювати з очікуванням. Замість callback-ів ви пишете код, який виглядає послідовним: він призупиняється, чекає і відновлюється. Під капотом runtime Swift ефективно керує цими паузами. Але чи залишатиметься ваш застосунок чуйним під час очікування, залежить від того, *де* виконується код, і про це ми поговоримо далі.

**Асинхронна функція** - це функція, якій може знадобитися призупинення. Ви позначаєте її як `async`, а під час виклику використовуєте `await`, щоб сказати "зупинись тут, доки це не завершиться":

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // Призупиняється тут
    return try JSONDecoder().decode(User.self, from: data)
}

// Виклик
let user = try await fetchUser(id: 123)
// Код тут виконається після завершення fetchUser
```

Ваш код призупиняється на кожному `await` - це називається **suspension**. Коли робота завершується, код відновлюється рівно там, де зупинився. Саме завдяки призупиненню Swift може займатися іншою роботою, поки триває очікування.

### Очікування *їх усіх*

Що, якщо треба отримати кілька речей? Можна чекати їх по черзі:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

Але це повільно: кожна операція чекає, поки завершиться попередня. Використовуйте `async let`, щоб запустити їх паралельно:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // Усі три запити виконуються паралельно!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

Кожен `async let` стартує одразу. `await` збирає результати.

<div class="tip">
<h4>await потребує async</h4>

Використовувати `await` можна лише всередині `async` функції.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [Керування роботою: Tasks](#tasks)

**[Task](https://developer.apple.com/documentation/swift/task)** - це одиниця асинхронної роботи, якою можна керувати. Ви пишете async функції, але саме Task фактично їх запускає. Це спосіб стартувати async код із синхронного коду, і він дає вам контроль над цією роботою: дочекатися результату, скасувати її або дати їй працювати у фоні.

Уявімо, що ви будуєте екран профілю. Завантажуйте аватар, коли view з'являється, за допомогою модифікатора [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)), який автоматично скасовується, коли view зникає:

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        Group {
            if let avatar {
                avatar
            } else {
                ProgressView()
            }
        }
        .task { avatar = await downloadAvatar() }
    }
}
```

Якщо користувачі можуть перемикатися між профілями, використовуйте `.task(id:)`, щоб перезавантажуватися, коли змінюється вибір:

```swift
struct ProfileView: View {
    var userID: String
    @State private var avatar: Image?

    var body: some View {
        Group {
            if let avatar {
                avatar
            } else {
                ProgressView()
            }
        }
        .task(id: userID) { avatar = await downloadAvatar(for: userID) }
    }
}
```

Коли користувач натискає "Save", створіть Task вручну:

```swift
Button("Save") {
    Task { await saveProfile() }
}
```

### Доступ до результатів Task

Коли ви створюєте Task, назад повертається handle. Використовуйте `.value`, щоб дочекатися результату й отримати його:

```swift
let handle = Task {
    return await fetchUserData()
}
let userData = await handle.value  // Призупиняється, доки task не завершиться
```

Це корисно, коли результат знадобиться пізніше або коли ви хочете зберегти handle task і очікувати його в іншому місці.

Що, якщо треба одночасно завантажити avatar, bio і stats? Використовуйте [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup), щоб отримати їх паралельно:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

Tasks усередині групи - це **дочірні task-и**, пов'язані з батьківською. Ось що важливо знати:

- **Скасування поширюється**: скасовуєте батьківську task - скасовуються й усі дочірні
- **Помилки**: кинута помилка скасовує сусідні task-и й прокидає помилку далі, але лише коли ви споживаєте результати через `next()`, `waitForAll()` або ітерацію
- **Порядок завершення**: результати приходять у тому порядку, в якому task-и завершуються, а не в якому ви їх додали
- **Очікування всіх**: група не поверне керування, доки кожна дочірня task не завершиться або не буде скасована

Це і є **[structured concurrency](https://developer.apple.com/videos/play/wwdc2021/10134/)**: робота, організована у дерево, яке легко розуміти й прибирати за собою.

  </div>
</section>

<section id="execution">
  <div class="container">

## [Де все виконується: від потоків до доменів ізоляції](#execution)

Поки що ми говорили про *коли* виконується код (`async/await`) і *як організувати* роботу (`Tasks`). Тепер головне: **де він виконується і як зробити це безпечно?**

<div class="tip">
<h4>Більшість застосунків просто чекають</h4>

Більшість коду в застосунках є **I/O-bound**. Ви отримуєте дані з мережі, *await*-ите відповідь, декодуєте її й показуєте. Якщо треба узгодити кілька I/O-операцій, ви вдаєтеся до *tasks* і *task groups*. Реальної CPU-роботи тут мінімум. Головний потік цілком справляється, бо `await` призупиняє виконання без блокування.

Але рано чи пізно у вас з'явиться **CPU-bound робота**: парсинг величезного JSON, обробка зображень, складні обчислення. Тут немає чого чекати зовні. Потрібні лише CPU-цикли. Якщо запускати таку роботу на головному потоці, UI зависне. Саме тут питання "де виконується код" стає по-справжньому важливим.
</div>

### Старий світ: багато варіантів, жодної безпеки

До системи конкурентності Swift у вас було кілька способів керувати виконанням:

| Підхід | Що робить | Компроміси |
|--------|-----------|------------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | Прямий контроль потоків | Низькорівнево, легко помилитися, майже ніколи не потрібно |
| [GCD](https://developer.apple.com/documentation/dispatch) | Черги dispatch із closure-ами | Просто, але без скасування, легко отримати вибух кількості потоків |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | Залежності між задачами, скасування, KVO | Більше контролю, але багатослівно і важкувато |
| [Combine](https://developer.apple.com/documentation/combine) | Реактивні потоки | Чудово для потоків подій, але складно вивчати |

Усе це працювало, але безпека повністю лежала на вас. Компілятор не міг допомогти, якщо ви забули повернутися на main thread або якщо дві черги одночасно звертаються до одних і тих самих даних.

### Проблема: гонки даних

Гонка даних ([data race](https://developer.apple.com/documentation/xcode/data-races)) трапляється, коли два потоки одночасно звертаються до однієї й тієї самої пам'яті, і щонайменше один із них щось записує:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// Невизначена поведінка: краш, пошкодження пам'яті або неправильне значення
```

Гонки даних - це невизначена поведінка. Вони можуть крешити застосунок, пошкоджувати пам'ять або тихо повертати неправильні результати. У тестах усе виглядає добре, а в продакшені воно випадково падає. Традиційні інструменти на кшталт lock-ів і semaphore-ів допомагають, але вони ручні й легко використовуються неправильно.

<div class="warning">
<h4>Конкурентність лише посилює проблему</h4>

Що більш конкурентний ваш застосунок, то ймовірніші гонки даних. Простий iOS-застосунок може якось пережити неакуратну потокобезпечність. Вебсервер, що одночасно обслуговує тисячі запитів, падатиме постійно. Саме тому безпека Swift на етапі компіляції найбільш цінна у середовищах із високою конкурентністю.
</div>

### Зсув мислення: від потоків до ізоляції

Модель конкурентності Swift ставить інше запитання. Замість "на якому потоці це має працювати?" вона питає: **"хто взагалі має право доступу до цих даних?"**

Це і є [ізоляція](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation). Замість ручного dispatch роботи на потоки ви оголошуєте межі навколо даних. Компілятор примусово забезпечує ці межі під час збірки, а не під час виконання.

<div class="tip">
<h4>Що під капотом</h4>

Swift Concurrency побудований поверх [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (того самого runtime, що й GCD). Різниця в шарі компіляції: actors та ізоляцію забезпечує компілятор, а runtime займається плануванням на [кооперативному пулі потоків](https://developer.apple.com/videos/play/wwdc2021/10254/), обмеженому кількістю ядер вашого CPU.
</div>

### Три домени ізоляції

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) - це [global actor](https://developer.apple.com/documentation/swift/globalactor), який представляє домен ізоляції головного потоку. Він особливий, бо UI-фреймворки (UIKit, AppKit, SwiftUI) вимагають доступу саме з main thread.

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // Захищено ізоляцією MainActor
}
```

Коли ви позначаєте щось як `@MainActor`, ви не кажете "відправ це на головний потік". Ви кажете "це належить домену ізоляції main actor". Компілятор вимагає, щоб будь-що, що звертається до цього коду або даних, уже було на MainActor або переходило через межу за допомогою `await`.

<div class="tip">
<h4>Коли сумніваєтесь, використовуйте @MainActor</h4>

Для більшості застосунків позначити свої ViewModel як `@MainActor` - правильне рішення. Побоювання щодо продуктивності зазвичай перебільшені. Починайте звідси й оптимізуйтеся лише тоді, коли реально виміряли проблему.
</div>

**2. Actors**

[actor](https://developer.apple.com/documentation/swift/actor) захищає власний змінний стан. Він гарантує, що до його даних одночасно має доступ лише один фрагмент коду:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // Безпечно: actor гарантує ексклюзивний доступ
    }
}

// Ззовні треба await-ити, щоб перетнути межу
await account.deposit(100)
```

**Actors - це не потоки.** Actor - це межа ізоляції. Який саме потік виконає код actor, вирішує runtime Swift. Ви цим не керуєте, і не повинні.

**3. Nonisolated**

Код, позначений як [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated), виходить з actor-ізоляції. Його можна викликати звідусіль без `await`, але він не має доступу до захищеного стану actor:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // Стан actor не зачіпається, виклик безпечний звідусіль
    }
}

let name = account.bankName()  // await не потрібен
```

<div class="tip">
<h4>Approachable Concurrency: менше тертя</h4>

[Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) спрощує ментальну модель двома параметрами збірки в Xcode:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: усе виконується на MainActor, якщо ви не сказали інакше
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: `nonisolated` async функції залишаються на actor викликача, а не стрибають на фоновий потік

Нові проєкти Xcode 26 мають обидва параметри увімкненими за замовчуванням. Коли потрібна CPU-інтенсивна робота поза main thread, використовуйте `@concurrent`.

<pre><code class="language-swift">// Виконується на MainActor (типовий випадок)
func updateUI() async { }

// Виконується на фоновому потоці (опціонально)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>Офісна будівля</h4>

Уявіть свій застосунок як офісну будівлю. Кожен **домен ізоляції** - це приватний кабінет із замком на дверях. Усередині одночасно може бути лише одна людина, яка працює з документами цього кабінету.

- **`MainActor`** - це рецепція, де відбуваються всі взаємодії з клієнтами. Вона одна, і саме там обробляється все, що бачить користувач.
- **`actor`** типи - це кабінети відділів: бухгалтерія, юристи, HR. Кожен захищає власні чутливі документи.
- **`nonisolated`** код - це коридор: спільний простір, яким може пройти будь-хто, але приватних документів там немає.

Ви не можете просто так увірватися до чужого кабінету. Ви стукаєте (`await`) і чекаєте, поки вас впустять.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [Що може перетинати домени ізоляції: Sendable](#sendable)

Домени ізоляції захищають дані, але зрештою вам усе одно доведеться передавати дані між ними. І коли ви це робите, Swift перевіряє, чи безпечно це.

Подумайте самі: якщо передати посилання на змінний class з одного actor до іншого, обидва actors можуть змінювати його одночасно. Саме таку гонку даних ми й намагаємося не допустити. Тож Swift має знати: чи можна безпечно ділитися цими даними?

Відповідь - протокол [`Sendable`](https://developer.apple.com/documentation/swift/sendable). Це маркер, який каже компілятору: "цей тип безпечно передавати через межі ізоляції":

- **Sendable** типи можна безпечно передавати (value types, незмінні дані, actors)
- **Non-Sendable** типи не можна (classes зі змінним станом)

```swift
// Sendable - це value type, кожне місце отримує власну копію
struct User: Sendable {
    let id: Int
    let name: String
}

// Non-Sendable - це class зі змінним станом
class Counter {
    var count = 0  // Два місця змінюють це одночасно = катастрофа
}
```

### Як робити типи Sendable

Swift автоматично виводить `Sendable` для багатьох типів:

- **Struct-и й enum-и**, у яких усі властивості `Sendable`, неявно є `Sendable`
- **Actors** завжди `Sendable`, бо вони захищають власний стан
- **`@MainActor` типи** є `Sendable`, бо MainActor серіалізує доступ

Із class-ами складніше. Class може відповідати `Sendable`, лише якщо він `final`, а всі його збережені властивості незмінні:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // Незмінна
    let timeout: Double   // Незмінна
}
```

Якщо у вас є class, який потокобезпечний іншими засобами (locks, atomics), ви можете використати [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable), щоб сказати компілятору: "повір мені":

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable - це обіцянка</h4>

Компілятор не перевірятиме потокобезпечність. Якщо ви помилилися, отримаєте гонки даних. Використовуйте обережно.
</div>

<div class="tip">
<h4>Approachable Concurrency: менше тертя</h4>

З [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) помилки, пов'язані із Sendable, трапляються значно рідше:

- Якщо код не перетинає межі ізоляції, вам не потрібен Sendable
- Async функції залишаються на actor викликача, замість того щоб стрибати на фоновий потік
- Компілятор краще розуміє, коли значення використовуються безпечно

Увімкніть це, встановивши `SWIFT_DEFAULT_ACTOR_ISOLATION` у `MainActor`, а `SWIFT_APPROACHABLE_CONCURRENCY` у `YES`. У нових проєктах Xcode 26 обидва параметри вже увімкнені. Коли вам справді потрібен паралелізм, позначайте функції `@concurrent`, а вже тоді думайте про Sendable.
</div>

<div class="analogy">
<h4>Ксерокопії проти оригіналів документів</h4>

Повернімося до офісної будівлі. Коли треба поділитися інформацією між відділами:

- **Ксерокопії безпечні** - якщо юридичний відділ зробив копію документа й передав її в бухгалтерію, у кожного є своя копія. Вони можуть щось на ній підкреслювати, змінювати, робити що завгодно. Конфлікту не буде.
- **Оригінали підписаних контрактів мають залишатися на місці** - якщо два відділи зможуть одночасно редагувати оригінал, почнеться хаос. У кого тоді справжня версія?

`Sendable` типи - як ксерокопії: ними безпечно ділитися, бо кожне місце отримує власну незалежну копію (value types) або тому, що вони незмінні (їх ніхто не може змінити). Не-`Sendable` типи - як оригінали контрактів: їх передавання створює ризик конфліктних змін.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [Як успадковується ізоляція](#isolation-inheritance)

Ви вже бачили, що домени ізоляції захищають дані, а Sendable контролює, що може перетинати їхні межі. Але як код узагалі опиняється всередині певного домену ізоляції?

Коли ви викликаєте функцію або створюєте closure, ізоляція протікає крізь ваш код. З [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) ваш застосунок стартує на [`MainActor`](https://developer.apple.com/documentation/swift/mainactor), і ця ізоляція поширюється на код, який ви викликаєте, якщо щось не змінює її явно. Розуміння цього потоку допомагає передбачити, де саме виконується код і чому компілятор іноді скаржиться.

### Виклики функцій

Коли ви викликаєте функцію, її ізоляція визначає, де вона виконується:

```swift
@MainActor func updateUI() { }      // Завжди виконується на MainActor
func helper() { }                    // Успадковує ізоляцію викликача
@concurrent func crunch() async { }  // Явно виконується поза actor
```

З [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) більшість вашого коду успадковує ізоляцію `MainActor`. Функція виконується там, де працює викликач, якщо явно не відмовилася від цього.

### Closure-и

Closure-и успадковують ізоляцію з того контексту, де вони були визначені:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // Успадковує MainActor від ViewModel
            self.updateUI()  // Безпечно, та сама ізоляція
        }
        closure()
    }
}
```

Саме тому action closure у SwiftUI `Button` можуть безпечно оновлювати `@State`: вони успадковують MainActor-ізоляцію від view.

### Tasks

`Task { }` успадковує actor-ізоляцію з місця, де її створили:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // Успадковує ізоляцію MainActor
            self.updateUI()  // Безпечно, await не потрібен
        }
    }
}
```

Зазвичай саме цього ви й хочете. Task працює на тому самому actor, що й код, який її створив.

### Розрив успадкування: Task.detached

Іноді вам потрібна task, яка нічого не успадковує:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // Без actor-ізоляції, виконується на кооперативному пулі
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // Явно повертаємося назад
            }
        }
    }

    nonisolated func expensiveCalculation() async -> Data {
        // CPU-інтенсивна робота
    }
}
```

<div class="warning">
<h4>Task і Task.detached - це антипатерн</h4>

Task-и, які ви створюєте через `Task { ... }`, не керуються зовні. Ви не можете їх скасувати або дізнатися, коли вони завершаться, якщо взагалі завершаться. Немає простого способу отримати їхнє значення або дізнатися, чи вони кинули помилку. У більшості випадків краще використовувати task-и, якими керують `.task` або `TaskGroup`, [як пояснено в розділі "Поширені помилки"](#managedtasks).

[Task.detached має бути вашим останнім засобом](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). Detached task-и не успадковують priority, task-local values чи actor-контекст. Якщо вам потрібна CPU-інтенсивна робота поза main actor, краще позначте функцію як `@concurrent`.
</div>

### Збереження ізоляції в async-утилітах

Іноді ви пишете узагальнену async функцію, яка приймає closure: обгортку, helper для повторних спроб, transactional scope. Викликач передає closure, а ваша функція її запускає. Звучить просто, правда?

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

Але якщо викликати це з контексту `@MainActor`, Swift почне скаржитися:

<div class="compiler-error">
Sending value of non-Sendable type '() async throws -> T' risks causing data races
</div>

Що відбувається? Ваше closure захоплює стан із MainActor, але `measure` є `nonisolated`. Swift бачить, як non-Sendable closure перетинає межу ізоляції, а саме це він і намагається заборонити.

Найпростіше виправлення - `nonisolated(nonsending)`. Це каже Swift, що функція має залишатися на тому executor, який її викликав:

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

Тепер уся функція виконується на executor викликача. Викликаєте її з MainActor - вона лишається на MainActor. Викликаєте з кастомного actor - лишається там. Closure не перетинає межу ізоляції, тож перевірка Sendable не потрібна.

<div class="tip">
<h4>Коли який підхід використовувати</h4>

**`nonisolated(nonsending)`** - простий варіант. Просто додайте атрибут. Використовуйте, коли вам потрібно лише залишитися на executor викликача.

**`isolation: isolated (any Actor)? = #isolation`** - явний варіант. Додає параметр, який дає вам доступ до екземпляра actor. Використовуйте, коли треба передати контекст ізоляції в інші функції або перевірити, на якому actor ви зараз перебуваєте.
</div>

Якщо вам справді потрібен явний доступ до actor, використовуйте параметр [`#isolation`](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/expressions/#Isolation-Expression):

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

Обидва підходи критично важливі для побудови async-утиліт, якими природно користуватися. Без них викликачам довелося б робити свої closure `@Sendable` або проходити крізь непотрібні обхідні шляхи, щоб задовольнити компілятор.

<div class="analogy">
<h4>Прогулянка будівлею</h4>

Коли ви перебуваєте в офісі на рецепції (MainActor) і кличете когось на допомогу, ця людина приходить *до вашого* кабінету. Вона успадковує ваше місце. Якщо ви створюєте task ("піди зроби це"), асистент теж стартує у вашому кабінеті.

Єдиний спосіб опинитися в іншому кабінеті - явно туди піти: "мені треба попрацювати в бухгалтерії" (`actor`) або "я зроблю це в бек-офісі" (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [Зводимо все докупи](#putting-it-together)

Зробімо крок назад і подивімося, як усі ці частини поєднуються.

Swift Concurrency може здаватися набором окремих понять: `async/await`, `Task`, actors, `MainActor`, `Sendable`, домени ізоляції. Але в центрі всього насправді лише одна ідея: **ізоляція успадковується за замовчуванням**.

Коли увімкнено [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), ваш застосунок стартує на [`MainActor`](https://developer.apple.com/documentation/swift/mainactor). Це ваша відправна точка. Далі:

- Кожна функція, яку ви викликаєте, **успадковує** цю ізоляцію
- Кожне closure, яке ви створюєте, **захоплює** цю ізоляцію
- Кожен [`Task { }`](https://developer.apple.com/documentation/swift/task), який ви запускаєте, **успадковує** цю ізоляцію

Вам не треба нічого додатково анотувати. Не треба думати про потоки. Ваш код виконується на `MainActor`, а ізоляція просто автоматично протікає крізь програму.

Коли ж треба вийти з цього успадкування, ви робите це явно:

- **`@concurrent`** каже: "запусти це на фоновому потоці"
- **`actor`** каже: "цей тип має власний домен ізоляції"
- **`Task.detached { }`** каже: "стартуй з нуля, нічого не успадковуй"

А коли ви передаєте дані між доменами ізоляції, Swift перевіряє, що це безпечно. Для цього і потрібен [`Sendable`](https://developer.apple.com/documentation/swift/sendable): він позначає типи, які можна безпечно передавати через межі.

Ось і вся модель:

1. **Ізоляція поширюється** від `MainActor` крізь ваш код
2. **Ви явно виходите з неї**, коли потрібна фонова робота або окремий стан
3. **Sendable охороняє межі**, коли дані переходять між доменами

Коли компілятор скаржиться, він фактично каже, що одне з цих правил порушено. Простежте спадкування: звідки взялася ізоляція? Де код намагається виконуватися? Які дані перетинають межу? Щойно ви ставите правильне запитання, відповідь зазвичай стає очевидною.

### Куди рухатися далі

Хороша новина: вам не потрібно опановувати все одразу.

**Більшості застосунків достатньо бази.** Позначте свої ViewModel як `@MainActor`, використовуйте `async/await` для мережевих викликів і створюйте `Task { }`, коли потрібно стартувати async роботу натисканням кнопки. Усе. Це покриває 80% реальних застосунків. Якщо знадобиться більше, компілятор підкаже.

**Коли потрібна паралельна робота**, використовуйте `async let`, щоб отримувати кілька речей одночасно, або [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup), коли кількість task-ів динамічна. Навчіться коректно працювати зі скасуванням. Це покриває застосунки зі складним завантаженням даних або можливостями реального часу.

**Складні патерни приходять пізніше**, якщо взагалі приходять. Кастомні actors для спільного змінного стану, `@concurrent` для CPU-інтенсивної обробки, глибоке розуміння `Sendable`. Це вже про framework-код, серверний Swift, складні настільні застосунки. Більшості розробників цей рівень ніколи не знадобиться.

<div class="tip">
<h4>Починайте просто</h4>

Не оптимізуйте під проблеми, яких у вас ще немає. Почніть із бази, випустіть застосунок, а складність додавайте лише тоді, коли натрапите на реальну проблему. Компілятор вас скерує.
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [Обережно: поширені помилки](#mistakes)

### Думати, що async = фон

```swift
// Це ВСЕ ОДНО блокує головний потік!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // Синхронна робота = блокування
    data = result
}
```

`async` означає "може призупинитися". Але сама робота все одно виконується там, де виконується. Для CPU-важкої роботи використовуйте `@concurrent` (Swift 6.2) або `Task.detached`.

### Створювати надто багато actors

```swift
// Надмірно ускладнено
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// Краще - більшість речей можуть жити на MainActor
@MainActor
class AppState { }
```

Кастомний actor потрібен лише тоді, коли у вас є спільний змінний стан, який не може жити на `MainActor`. [Правило Matt Massicotte](https://www.massicotte.org/actors/): додавайте actor лише тоді, коли (1) у вас є non-`Sendable` стан, (2) операції над цим станом мають бути атомарними, і (3) ці операції не можуть працювати на вже існуючому actor. Якщо не можете це обґрунтувати, використовуйте `@MainActor`.

### Робити все Sendable

Не все взагалі повинно перетинати межі. Якщо ви додаєте `@unchecked Sendable` усюди підряд, зробіть крок назад і запитайте себе, чи справді ці дані мають рухатися між доменами ізоляції.

### Використовувати MainActor.run без потреби

```swift
// Непотрібно
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// Краще - просто позначити функцію як @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` рідко є правильним рішенням. Якщо вам потрібна ізоляція MainActor, просто анотуйте функцію як `@MainActor`. Так зрозуміліше, і компілятор зможе допомогти краще. Дивіться [думку Matt про це](https://www.massicotte.org/problematic-patterns/).

### Блокувати кооперативний пул потоків

```swift
// НІКОЛИ так не робіть - ризик дедлоку
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // Блокує кооперативний потік!
}
```

Кооперативний пул потоків Swift має обмежену кількість потоків. Якщо заблокувати один із них через `DispatchSemaphore`, `DispatchGroup.wait()` або щось подібне, легко отримати дедлок. Якщо треба з'єднати sync і async код, використовуйте `async let` або перебудуйте код так, щоб він лишався повністю async.

<div id="managedtasks">

### Створення некерованих task-ів

Task-и, які ви вручну створюєте через `Task { ... }` або `Task.detached { ... }`, не керуються. Після створення ви вже не маєте над ними контролю. Їх не можна скасувати, якщо task, з якої ви їх стартували, буде скасована. Ви не знаєте, чи вони завершилися, чи кинули помилку, і не можете зібрати їхнє значення. Стартувати таку task - це ніби кинути пляшку в море й сподіватися, що вона дістанеться до адресата, але більше ніколи цю пляшку не побачити.

<div class="analogy">
<h4>Офісна будівля</h4>

`Task` - це ніби доручити роботу працівниці. Вона опрацьовує запит (зокрема чекає на інші офіси), поки ви займаєтеся своєю поточною роботою.

Після того як ви доручили їй роботу, у вас немає способу з нею комунікувати. Ви не можете сказати їй зупинитися, не можете дізнатися, чи вона завершила роботу, і який отримала результат.

Насправді вам потрібна рація, щоб підтримувати зв'язок із нею, поки вона працює над запитом. Із рацією ви можете сказати їй зупинитися, вона може повідомити вам про помилку або передати результат роботи, яку ви їй дали.
</div>

Замість створення некерованих task-ів використовуйте засоби Swift concurrency так, щоб зберігати контроль над підзадачами. Для керування підзадачами використовуйте `TaskGroup`. Swift надає кілька функцій `withTaskGroup() { group in ... }`, які допомагають створювати групи task-ів.

```swift
func doWork() async {

    // це повернеться, коли всі підзадачі завершаться, кинуть помилку або будуть скасовані
    let result = try await withThrowingTaskGroup() { group in 
        group.addTask {
            try await self.performAsyncOperation1()  
        }
        group.addTask {
            try await self.performAsyncOperation2()  
        }
        // дочекайтеся й зберіть результати task-ів тут
    }
}

func performAsyncOperation1() async throws -> Int {
    return 1
}
func performAsyncOperation2() async throws -> Int {
    return 2
}
```

Щоб зібрати результати дочірніх task-ів групи, можна використати цикл for-await-in:

```swift
var sum = 0
for await result in group {
    sum += result
}
// sum == 3 
```

Більше про [TaskGroup](https://developer.apple.com/documentation/swift/taskgroup) можна прочитати в документації Swift.

#### Примітка про Tasks і SwiftUI

Під час роботи з UI часто потрібно запускати асинхронні task-и із синхронного контексту. Наприклад, ви хочете асинхронно завантажити зображення у відповідь на дотик до елемента UI. Напряму запускати асинхронні task-и із синхронного контексту в Swift не можна. Саме тому ви так часто бачите рішення з `Task { ... }`, які створюють некеровані task-и.

Ви не можете використати `TaskGroup` із синхронного SwiftUI modifier, бо `withTaskGroup()` теж є async функцією, як і пов'язані з нею API.

Натомість SwiftUI пропонує асинхронний модифікатор, який можна використати для старту асинхронних операцій. Модифікатор `.task { }`, який ми вже згадували, приймає функцію `() async -> Void`, що ідеально підходить для виклику інших `async` функцій. Він доступний на кожному `View`. Він спрацьовує до появи view, а task-и, які він створює, керуються життєвим циклом view, тобто скасовуються, коли view зникає.

Повернімося до прикладу з натисканням, щоб завантажити зображення: замість створення некерованої task для виклику асинхронної `loadImage()` із синхронної `.onTap() { ... }` функції, можна перемикати прапорець у tap gesture та використовувати `task(id:)`, щоб асинхронно завантажувати зображення, коли змінюється значення `id` (тобто цього прапорця).

Ось приклад:

```swift
struct ContentView: View {
    
    @State private var shouldLoadImage = false
    
    var body: some View {
        Button("Click Me !") {
            // перемикаємо прапорець
            shouldLoadImage = !shouldLoadImage
        }
        // View керує підзадачею
        // вона стартує до показу view
        // і зупиняється, коли view ховається
        .task(id: shouldLoadImage) {
            // коли значення прапорця змінюється, SwiftUI перезапускає task
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

## [Шпаргалка: швидкий довідник](#glossary)

| Keyword | Що робить |
|---------|-----------|
| `async` | Функція може призупинятися |
| `await` | Призупинися тут, доки не завершиться |
| `Task { }` | Запускає async роботу, успадковує контекст |
| `Task.detached { }` | Запускає async роботу без успадкованого контексту |
| `@MainActor` | Виконується на головному потоці |
| `actor` | Тип з ізольованим змінним станом |
| `nonisolated` | Виходить з actor-ізоляції |
| `nonisolated(nonsending)` | Лишається на executor викликача |
| `Sendable` | Безпечно передавати між доменами ізоляції |
| `@concurrent` | Завжди виконується у фоні (Swift 6.2+) |
| `#isolation` | Захоплює ізоляцію викликача як параметр |
| `async let` | Запускає паралельну роботу |
| `TaskGroup` | Динамічна паралельна робота |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [Що почитати далі](#further-reading)

<div class="resources">
<h4>Блог Matt Massicotte (дуже рекомендовано)</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - ключова термінологія
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - базова концепція
- [When should you use an actor?](https://www.massicotte.org/actors/) - практичні поради
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - чому простіший підхід часто кращий
</div>

<div class="resources">
<h4>Офіційні ресурси Apple</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>Інструменти</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) - допомагає швидше постачати продукти великим командам і кодовим базам
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [Skill для AI-агентів](#ai-skill)

Хочете, щоб ваш AI-асистент для програмування розумів Swift Concurrency? Ми надаємо файл **[SKILL.md](/SKILL.md)**, який пакує ці ментальні моделі для AI-агентів на кшталт Claude Code, Codex, Amp, OpenCode та інших.

### Інші скіли

- <a href="https://github.com/AvdLee/Swift-Concurrency-Agent-Skill" target="_blank" rel="noreferrer noopener">Open-source Swift Concurrency Agent Skill від Antoine</a>

<div class="tip">
<h4>Що таке Skill?</h4>

Skill - це markdown-файл, який навчає AI-агентів спеціалізованим знанням. Коли ви додаєте Swift Concurrency skill до свого агента, він автоматично застосовує ці концепції, допомагаючи вам писати async Swift-код.
</div>

### Як використовувати

Виберіть свого агента і запустіть наведені нижче команди:

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
# Персональний skill (для всіх ваших проєктів)
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Skill для цього проєкту
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Інструкції для проєкту (рекомендовано)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Глобальні інструкції (для всіх ваших проєктів)
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Інструкції для цього проєкту
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>

  <div class="code-tab-content">

```bash
# Глобальні правила (для всіх ваших проєктів)
mkdir -p ~/.kiro/steering
curl -o ~/.kiro/steering/swift-concurrency.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Правила для цього проєкту
mkdir -p .kiro/steering
curl -o .kiro/steering/swift-concurrency.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>

  <div class="code-tab-content">

```bash
# Глобальні правила (для всіх ваших проєктів)
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Правила для цього проєкту
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

Цей skill містить аналогію з офісною будівлею, патерни ізоляції, поради щодо Sendable, поширені помилки та швидкий довідник. Ваш агент автоматично використовуватиме ці знання, коли ви працюватимете з кодом Swift Concurrency.

  </div>
</section>
