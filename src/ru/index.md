---
layout: base.njk
title: Чертовски понятный Swift Concurrency
description: Честное руководство по конкурентности в Swift. Изучите async/await, actors, Sendable и MainActor с простыми ментальными моделями. Без жаргона, только понятные объяснения.
lang: ru
dir: ltr
nav:
  async-await: Async/Await
  tasks: Задачи
  execution: Изоляция
  sendable: Sendable
  putting-it-together: Итоги
  mistakes: Подводные камни
footer:
  madeWith: Сделано с разочарованием и любовью. Потому что конкурентность Swift не должна быть запутанной.
  viewOnGitHub: Смотреть на GitHub
---

<section class="hero">
  <div class="container">
    <h1>Чертовски понятный<br><span class="accent">Swift Concurrency</span></h1>
    <p class="subtitle">Наконец-то поймите async/await, Tasks и почему компилятор постоянно на вас ругается.</p>
    <p class="credit">Огромная благодарность <a href="https://www.massicotte.org/">Matt Massicotte</a> за то, что сделал конкурентность Swift понятной. Составлено <a href="https://pepicrft.me">Pedro Piñera</a>. Нашли ошибку? <a href="mailto:pedro@tuist.dev">pedro@tuist.dev</a></p>
    <p class="tribute">В традициях <a href="https://fuckingblocksyntax.com/">fuckingblocksyntax.com</a> и <a href="https://fuckingifcaseletsyntax.com/">fuckingifcaseletsyntax.com</a></p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [Асинхронный код: async/await](#async-await)

Большую часть времени приложения просто ждут. Получить данные с сервера - ждать ответа. Прочитать файл с диска - ждать байтов. Запросить базу данных - ждать результатов.

До появления системы конкурентности Swift вы выражали это ожидание через callback'и, делегаты или [Combine](https://developer.apple.com/documentation/combine). Они работают, но вложенные callback'и становятся трудночитаемыми, а у Combine крутая кривая обучения.

`async/await` даёт Swift новый способ обработки ожидания. Вместо callback'ов вы пишете код, который выглядит последовательным - он приостанавливается, ждёт и возобновляется. Под капотом runtime Swift эффективно управляет этими паузами. Но чтобы ваше приложение оставалось отзывчивым во время ожидания, важно *где* выполняется код, о чём мы поговорим позже.

**Асинхронная функция** - это функция, которая может приостановиться. Вы помечаете её `async`, а при вызове используете `await`, чтобы сказать "подожди здесь, пока это не закончится":

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // Приостанавливается здесь
    return try JSONDecoder().decode(User.self, from: data)
}

// Вызов
let user = try await fetchUser(id: 123)
// Код здесь выполняется после завершения fetchUser
```

Ваш код приостанавливается на каждом `await` - это называется **приостановка (suspension)**. Когда работа завершается, ваш код возобновляется ровно там, где остановился. Приостановка даёт Swift возможность делать другую работу во время ожидания.

### Ожидание *нескольких*

Что если вам нужно получить несколько вещей? Можно ждать их по одной:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

Но это медленно - каждая ждёт завершения предыдущей. Используйте `async let` для параллельного выполнения:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // Все три загружаются параллельно!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

Каждый `async let` стартует немедленно. `await` собирает результаты.

<div class="tip">
<h4>await требует async</h4>

Вы можете использовать `await` только внутри `async` функции.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [Управление работой: Tasks](#tasks)

**[Task](https://developer.apple.com/documentation/swift/task)** - это единица асинхронной работы, которой вы можете управлять. Вы написали async функции, но Task - это то, что их реально выполняет. Это способ запустить async код из синхронного кода, и он даёт вам контроль над этой работой: дождаться результата, отменить её или пустить в фоне.

Допустим, вы делаете экран профиля. Загрузите аватар при появлении view, используя модификатор [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)), который автоматически отменяется при исчезновении view:

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task { avatar = await downloadAvatar() }
    }
}
```

Если пользователи могут переключаться между профилями, используйте `.task(id:)` для перезагрузки при смене выбора:

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

Когда пользователь нажимает "Сохранить", создайте Task вручную:

```swift
Button("Save") {
    Task { await saveProfile() }
}
```

Что если нужно загрузить аватар, био и статистику одновременно? Используйте [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) для параллельной загрузки:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

Задачи внутри группы - это **дочерние задачи**, связанные с родительской. Несколько важных моментов:

- **Отмена распространяется**: отмените родителя, и все дочерние тоже будут отменены
- **Ошибки**: выброшенная ошибка отменяет соседей и пробрасывается дальше, но только когда вы потребляете результаты через `next()`, `waitForAll()` или итерацию
- **Порядок завершения**: результаты приходят по мере завершения задач, а не в порядке добавления
- **Ожидание всех**: группа не возвращается, пока каждый ребёнок не завершится или не будет отменён

Это **[структурированная конкурентность](https://developer.apple.com/videos/play/wwdc2021/10134/)**: работа, организованная в дерево, которое легко понимать и очищать.

  </div>
</section>

<section id="execution">
  <div class="container">

## [Где выполняется код: от потоков к доменам изоляции](#execution)

До сих пор мы говорили о том, *когда* код выполняется (async/await) и *как его организовать* (Tasks). Теперь: **где он выполняется и как обеспечить его безопасность?**

<div class="tip">
<h4>Большинство приложений просто ждут</h4>

Большая часть кода приложений - это **I/O-bound** операции. Вы получаете данные из сети, *ждёте* ответа, декодируете и отображаете. Если у вас несколько I/O операций для координации, вы прибегаете к *tasks* и *task groups*. Реальная работа CPU минимальна. Главный поток справляется с этим нормально, потому что `await` приостанавливает, не блокируя.

Но рано или поздно у вас появится **CPU-bound работа**: парсинг гигантского JSON файла, обработка изображений, сложные вычисления. Эта работа ничего внешнего не ждёт. Ей просто нужны циклы CPU. Если запустить её на главном потоке, ваш UI зависнет. Вот тут и становится важно "где выполняется код".
</div>

### Старый мир: много вариантов, никакой безопасности

До системы конкурентности Swift у вас было несколько способов управления выполнением:

| Подход | Что делает | Компромиссы |
|--------|------------|-------------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | Прямой контроль потоков | Низкоуровневый, подвержен ошибкам, редко нужен |
| [GCD](https://developer.apple.com/documentation/dispatch) | Dispatch очереди с замыканиями | Просто, но нет отмены, легко вызвать взрыв потоков |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | Зависимости задач, отмена, KVO | Больше контроля, но многословно и тяжеловесно |
| [Combine](https://developer.apple.com/documentation/combine) | Реактивные потоки | Отлично для потоков событий, крутая кривая обучения |

Всё это работало, но безопасность была полностью на вас. Компилятор не мог помочь, если вы забыли dispatch на main, или если две очереди одновременно обращались к одним данным.

### Проблема: гонки данных

[Гонка данных](https://developer.apple.com/documentation/xcode/data-race) случается, когда два потока одновременно обращаются к одной памяти, и хотя бы один пишет:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// Неопределённое поведение: падение, порча памяти или неправильное значение
```

Гонки данных - это неопределённое поведение. Они могут крашить, портить память или молча выдавать неправильные результаты. Ваше приложение прекрасно работает в тестах, а потом случайно падает в продакшене. Традиционные инструменты вроде блокировок и семафоров помогают, но они ручные и подвержены ошибкам.

<div class="warning">
<h4>Конкурентность усугубляет проблему</h4>

Чем больше конкурентности в вашем приложении, тем вероятнее становятся гонки данных. Простое iOS приложение может обойтись небрежной потокобезопасностью. Веб-сервер, обрабатывающий тысячи одновременных запросов, будет падать постоянно. Вот почему безопасность на этапе компиляции в Swift важнее всего в высококонкурентных средах.
</div>

### Сдвиг парадигмы: от потоков к изоляции

Модель конкурентности Swift задаёт другой вопрос. Вместо "на каком потоке это должно выполняться?" она спрашивает: **"кому разрешено обращаться к этим данным?"**

Это [изоляция](https://developer.apple.com/documentation/swift/isolation). Вместо ручной отправки работы на потоки вы объявляете границы вокруг данных. Компилятор обеспечивает эти границы на этапе сборки, а не в runtime.

<div class="tip">
<h4>Под капотом</h4>

Swift Concurrency построен поверх [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (тот же runtime, что и GCD). Разница в слое компиляции: акторы и изоляция обеспечиваются компилятором, в то время как runtime управляет планированием на [кооперативном пуле потоков](https://developer.apple.com/videos/play/wwdc2021/10254/), ограниченном количеством ядер вашего CPU.
</div>

### Три домена изоляции

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) - это [глобальный актор](https://developer.apple.com/documentation/swift/globalactor), представляющий домен изоляции главного потока. Он особенный, потому что UI-фреймворки (UIKit, AppKit, SwiftUI) требуют доступа с главного потока.

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // Защищено изоляцией MainActor
}
```

Когда вы помечаете что-то `@MainActor`, вы не говорите "dispatch это на главный поток". Вы говорите "это принадлежит домену изоляции главного актора". Компилятор гарантирует, что всё, что к этому обращается, либо находится на MainActor, либо должно использовать `await` для пересечения границы.

<div class="tip">
<h4>Если сомневаетесь - используйте @MainActor</h4>

Для большинства приложений пометить ваши ViewModel атрибутом `@MainActor` - правильный выбор. Беспокойства о производительности обычно преувеличены. Начните отсюда, оптимизируйте только если измерите реальные проблемы.
</div>

**2. Actors**

[Актор](https://developer.apple.com/documentation/swift/actor) защищает своё собственное изменяемое состояние. Он гарантирует, что только один кусок кода может обращаться к его данным в один момент времени:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // Безопасно: актор гарантирует эксклюзивный доступ
    }
}

// Извне нужно использовать await для пересечения границы
await account.deposit(100)
```

**Акторы - это не потоки.** Актор - это граница изоляции. Runtime Swift решает, какой поток реально выполняет код актора. Вы это не контролируете, и вам не нужно.

**3. Nonisolated**

Код, помеченный [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated), отказывается от изоляции актора. Его можно вызвать откуда угодно без `await`, но он не может обращаться к защищённому состоянию актора:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // Не обращается к состоянию актора, безопасно вызывать откуда угодно
    }
}

let name = account.bankName()  // await не нужен
```

<div class="tip">
<h4>Approachable Concurrency: меньше трения</h4>

[Approachable Concurrency](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html) упрощает ментальную модель с помощью двух настроек сборки Xcode:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: Всё выполняется на MainActor, если вы не скажете иначе
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: `nonisolated` async функции остаются на акторе вызывающего вместо прыжка на фоновый поток

Новые проекты Xcode 26 имеют оба включёнными по умолчанию. Когда нужна CPU-интенсивная работа вне главного потока, используйте `@concurrent`.

<pre><code class="language-swift">// Выполняется на MainActor (по умолчанию)
func updateUI() async { }

// Выполняется на фоновом потоке (opt-in)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>Офисное здание</h4>

Представьте ваше приложение как офисное здание. Каждый **домен изоляции** - это приватный офис с замком на двери. Только один человек может находиться внутри одновременно, работая с документами в этом офисе.

- **`MainActor`** - это ресепшен, где происходит всё взаимодействие с клиентами. Он один, и он обрабатывает всё, что видит пользователь.
- **`actor`** типы - это офисы отделов: бухгалтерия, юридический, HR. Каждый защищает свои конфиденциальные документы.
- **`nonisolated`** код - это коридор, общее пространство, через которое может пройти кто угодно, но никаких приватных документов там нет.

Вы не можете просто ворваться в чужой офис. Вы стучите (`await`) и ждёте, пока вас впустят.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [Что может пересекать домены изоляции: Sendable](#sendable)

Домены изоляции защищают данные, но рано или поздно вам нужно передавать данные между ними. Когда вы это делаете, Swift проверяет, безопасно ли это.

Подумайте: если вы передаёте ссылку на изменяемый класс от одного актора другому, оба актора могут изменять его одновременно. Это именно та гонка данных, которую мы пытаемся предотвратить. Поэтому Swift должен знать: можно ли безопасно делиться этими данными?

Ответ - протокол [`Sendable`](https://developer.apple.com/documentation/swift/sendable). Это маркер, который говорит компилятору "этот тип безопасно передавать через границы изоляции":

- **Sendable** типы могут пересекать безопасно (типы значений, неизменяемые данные, акторы)
- **Не-Sendable** типы не могут (классы с изменяемым состоянием)

```swift
// Sendable - это тип значения, каждое место получает копию
struct User: Sendable {
    let id: Int
    let name: String
}

// Не-Sendable - это класс с изменяемым состоянием
class Counter {
    var count = 0  // Два места изменяют это = катастрофа
}
```

### Делаем типы Sendable

Swift автоматически выводит `Sendable` для многих типов:

- **Структуры и перечисления** только с `Sendable` свойствами неявно `Sendable`
- **Акторы** всегда `Sendable`, потому что они защищают своё собственное состояние
- **`@MainActor` типы** являются `Sendable`, потому что MainActor сериализует доступ

Для классов это сложнее. Класс может соответствовать `Sendable`, только если он `final` и все его хранимые свойства неизменяемы:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // Неизменяемый
    let timeout: Double   // Неизменяемый
}
```

Если у вас есть класс, который потокобезопасен другими средствами (блокировки, атомики), можно использовать [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable), чтобы сказать компилятору "доверься мне":

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable - это обещание</h4>

Компилятор не будет проверять потокобезопасность. Если вы ошиблись, получите гонки данных. Используйте осторожно.
</div>

<div class="tip">
<h4>Approachable Concurrency: меньше трения</h4>

С [Approachable Concurrency](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html) ошибки Sendable становятся намного реже:

- Если код не пересекает границы изоляции, вам не нужен Sendable
- Async функции остаются на акторе вызывающего вместо прыжка на фоновый поток
- Компилятор умнее в определении, когда значения используются безопасно

Включите, установив `SWIFT_DEFAULT_ACTOR_ISOLATION` в `MainActor` и `SWIFT_APPROACHABLE_CONCURRENCY` в `YES`. Новые проекты Xcode 26 имеют оба включёнными по умолчанию. Когда вам нужен параллелизм, пометьте функции `@concurrent`, и тогда думайте о Sendable.
</div>

<div class="analogy">
<h4>Ксерокопии vs оригиналы документов</h4>

Вернёмся к офисному зданию. Когда вам нужно поделиться информацией между отделами:

- **Ксерокопии безопасны** - если юридический отдел делает копию документа и отправляет в бухгалтерию, у обоих своя копия. Они могут черкать на них, изменять, что угодно. Никакого конфликта.
- **Оригиналы подписанных контрактов должны оставаться на месте** - если два отдела могут оба изменять оригинал, наступает хаос. У кого настоящая версия?

`Sendable` типы как ксерокопии: безопасно делиться, потому что каждое место получает свою независимую копию (типы значений) или потому что они неизменяемы (никто не может их изменить). Не-`Sendable` типы как оригиналы контрактов: их передача создаёт потенциал для конфликтующих изменений.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [Как наследуется изоляция](#isolation-inheritance)

Вы видели, что домены изоляции защищают данные, а Sendable контролирует, что пересекает границы между ними. Но как код вообще оказывается в домене изоляции?

Когда вы вызываете функцию или создаёте замыкание, изоляция течёт через ваш код. С [Approachable Concurrency](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html) ваше приложение стартует на [`MainActor`](https://developer.apple.com/documentation/swift/mainactor), и эта изоляция распространяется на код, который вы вызываете, если только что-то явно её не меняет. Понимание этого потока помогает предсказать, где выполняется код и почему компилятор иногда жалуется.

### Вызовы функций

Когда вы вызываете функцию, её изоляция определяет, где она выполняется:

```swift
@MainActor func updateUI() { }      // Всегда выполняется на MainActor
func helper() { }                    // Наследует изоляцию вызывающего
@concurrent func crunch() async { }  // Явно выполняется вне актора
```

С [Approachable Concurrency](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html) большая часть вашего кода наследует изоляцию `MainActor`. Функция выполняется там, где выполняется вызывающий, если она явно не отказывается.

### Замыкания

Замыкания наследуют изоляцию от контекста, где они определены:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // Наследует MainActor от ViewModel
            self.updateUI()  // Безопасно, та же изоляция
        }
        closure()
    }
}
```

Вот почему замыкания action в SwiftUI `Button` могут безопасно обновлять `@State`: они наследуют изоляцию MainActor от view.

### Tasks

`Task { }` наследует изоляцию актора от места, где он создан:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // Наследует изоляцию MainActor
            self.updateUI()  // Безопасно, await не нужен
        }
    }
}
```

Обычно это то, что вам нужно. Task выполняется на том же акторе, что и код, который его создал.

### Разрыв наследования: Task.detached

Иногда вам нужен task, который ничего не наследует:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // Нет изоляции актора, выполняется на кооперативном пуле
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // Явный прыжок обратно
            }
        }
    }
}
```

<div class="warning">
<h4>Task.detached обычно неправильный выбор</h4>

Команда Swift рекомендует [Task.detached как крайнюю меру](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). Он не наследует приоритет, task-local значения или контекст актора. В большинстве случаев обычный `Task` - это то, что вам нужно. Если нужна CPU-интенсивная работа вне главного актора, пометьте функцию `@concurrent` вместо этого.
</div>

<div class="analogy">
<h4>Прогулка по зданию</h4>

Когда вы в офисе ресепшена (MainActor) и зовёте кого-то помочь, они приходят в *ваш* офис. Они наследуют ваше местоположение. Если вы создаёте task ("сделай это для меня"), этот помощник тоже начинает в вашем офисе.

Единственный способ оказаться в другом офисе - это явно туда пойти: "Мне нужно поработать в бухгалтерии для этого" (`actor`), или "Я займусь этим в заднем офисе" (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [Складываем всё вместе](#putting-it-together)

Давайте отступим назад и посмотрим, как все части сочетаются.

Swift Concurrency может ощущаться как куча концепций: `async/await`, `Task`, акторы, `MainActor`, `Sendable`, домены изоляции. Но на самом деле в центре всего одна идея: **изоляция наследуется по умолчанию**.

С включённым [Approachable Concurrency](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html) ваше приложение стартует на [`MainActor`](https://developer.apple.com/documentation/swift/mainactor). Это ваша отправная точка. Оттуда:

- Каждая функция, которую вы вызываете, **наследует** эту изоляцию
- Каждое замыкание, которое вы создаёте, **захватывает** эту изоляцию
- Каждый [`Task { }`](https://developer.apple.com/documentation/swift/task), который вы порождаете, **наследует** эту изоляцию

Вам не нужно ничего аннотировать. Вам не нужно думать о потоках. Ваш код выполняется на `MainActor`, и изоляция просто распространяется через вашу программу автоматически.

Когда вам нужно выйти из этого наследования, вы делаете это явно:

- **`@concurrent`** говорит "выполняй это на фоновом потоке"
- **`actor`** говорит "этот тип имеет свой собственный домен изоляции"
- **`Task.detached { }`** говорит "начни с чистого листа, ничего не наследуй"

А когда вы передаёте данные между доменами изоляции, Swift проверяет, что это безопасно. Для этого и нужен [`Sendable`](https://developer.apple.com/documentation/swift/sendable): помечать типы, которые могут безопасно пересекать границы.

Вот и всё. Вот вся модель:

1. **Изоляция распространяется** от `MainActor` через ваш код
2. **Вы отказываетесь явно**, когда нужна фоновая работа или отдельное состояние
3. **Sendable охраняет границы**, когда данные пересекают домены

Когда компилятор жалуется, он говорит вам, что одно из этих правил нарушено. Проследите наследование: откуда пришла изоляция? Где код пытается выполниться? Какие данные пересекают границу? Ответ обычно очевиден, когда вы задаёте правильный вопрос.

### Куда двигаться дальше

Хорошая новость: вам не нужно осваивать всё сразу.

**Большинству приложений нужны только основы.** Пометьте ваши ViewModel атрибутом `@MainActor`, используйте `async/await` для сетевых вызовов и создавайте `Task { }`, когда нужно запустить async работу по нажатию кнопки. Вот и всё. Это покрывает 80% реальных приложений. Компилятор подскажет, если нужно больше.

**Когда нужна параллельная работа**, используйте `async let` для получения нескольких вещей одновременно, или [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup), когда количество задач динамическое. Научитесь изящно обрабатывать отмену. Это покрывает приложения со сложной загрузкой данных или real-time фичами.

**Продвинутые паттерны придут позже**, если вообще понадобятся. Кастомные акторы для общего изменяемого состояния, `@concurrent` для CPU-интенсивной обработки, глубокое понимание `Sendable`. Это код фреймворков, серверный Swift, сложные десктопные приложения. Большинству разработчиков этот уровень никогда не понадобится.

<div class="tip">
<h4>Начните просто</h4>

Не оптимизируйте под проблемы, которых у вас нет. Начните с основ, выпустите приложение и добавляйте сложность только когда столкнётесь с реальными проблемами. Компилятор вас направит.
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [Осторожно: типичные ошибки](#mistakes)

### Думать, что async = фон

```swift
// Это ВСЁ ЕЩЁ блокирует главный поток!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // Синхронная работа = блокировка
    data = result
}
```

`async` означает "может приостановиться". Реальная работа всё ещё выполняется там, где выполняется. Используйте `@concurrent` (Swift 6.2) или `Task.detached` для CPU-тяжёлой работы.

### Создание слишком многих акторов

```swift
// Переусложнено
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// Лучше - большинство вещей могут жить на MainActor
@MainActor
class AppState { }
```

Вам нужен кастомный актор только когда у вас есть общее изменяемое состояние, которое не может жить на `MainActor`. [Правило Matt Massicotte](https://www.massicotte.org/actors/): вводите актор только когда (1) у вас есть не-`Sendable` состояние, (2) операции над этим состоянием должны быть атомарными, и (3) эти операции не могут выполняться на существующем акторе. Если не можете это обосновать, используйте `@MainActor` вместо этого.

### Делать всё Sendable

Не всё должно пересекать границы. Если вы добавляете `@unchecked Sendable` везде, остановитесь и спросите, действительно ли данным нужно перемещаться между доменами изоляции.

### Использование MainActor.run когда не нужно

```swift
// Не нужно
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// Лучше - просто сделайте функцию @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` редко правильное решение. Если вам нужна изоляция MainActor, аннотируйте функцию `@MainActor` вместо этого. Это понятнее, и компилятор сможет помочь больше. См. [мнение Matt об этом](https://www.massicotte.org/problematic-patterns/).

### Блокировка кооперативного пула потоков

```swift
// НИКОГДА так не делайте - риск deadlock
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // Блокирует кооперативный поток!
}
```

Кооперативный пул потоков Swift имеет ограниченное количество потоков. Блокировка одного через `DispatchSemaphore`, `DispatchGroup.wait()` или подобные вызовы может вызвать deadlock. Если нужно связать sync и async код, используйте `async let` или перестройте, чтобы оставаться полностью async.

### Создание ненужных Tasks

```swift
// Ненужное создание Task
func fetchAll() async {
    Task { await fetchUsers() }
    Task { await fetchPosts() }
}

// Лучше - используйте структурированную конкурентность
func fetchAll() async {
    async let users = fetchUsers()
    async let posts = fetchPosts()
    await (users, posts)
}
```

Если вы уже в async контексте, предпочитайте структурированную конкурентность (`async let`, `TaskGroup`) вместо создания неструктурированных `Task`. Структурированная конкурентность автоматически обрабатывает отмену и делает код проще для понимания.

  </div>
</section>

<section id="glossary">
  <div class="container">

## [Шпаргалка: краткий справочник](#glossary)

| Ключевое слово | Что делает |
|----------------|------------|
| `async` | Функция может приостанавливаться |
| `await` | Приостановиться здесь до завершения |
| `Task { }` | Запустить async работу, наследует контекст |
| `Task.detached { }` | Запустить async работу, без наследования контекста |
| `@MainActor` | Выполняется на главном потоке |
| `actor` | Тип с изолированным изменяемым состоянием |
| `nonisolated` | Отказ от изоляции актора |
| `Sendable` | Безопасно передавать между доменами изоляции |
| `@concurrent` | Всегда выполнять в фоне (Swift 6.2+) |
| `async let` | Запустить параллельную работу |
| `TaskGroup` | Динамическая параллельная работа |

## Дополнительное чтение

<div class="resources">
<h4>Блог Matt Massicotte (очень рекомендуется)</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - Основная терминология
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - Ключевая концепция
- [When should you use an actor?](https://www.massicotte.org/actors/) - Практическое руководство
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - Почему проще лучше
</div>

<div class="resources">
<h4>Официальные ресурсы Apple</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

  </div>
</section>
