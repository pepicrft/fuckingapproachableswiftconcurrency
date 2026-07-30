---
layout: base.njk
title: Zajebiście Przystępne Swift Concurrency
description: Przewodnik po współbieżności w Swift bez bzdur. Naucz się async/await, aktorów, Sendable i MainActor z prostych modeli mentalnych. Bez żargonu, same jasne wyjaśnienia.
lang: pl
dir: ltr
nav:
  async-await: Async/Await
  tasks: Taski
  execution: Izolacja
  sendable: Sendable
  putting-it-together: Podsumowanie
  mistakes: Pułapki
footer:
  madeWith: Zbudowane z frustracji i miłości. Bo współbieżność w Swift nie musi być zagmatwana.
  tradition: W nawiązaniu do
  traditionAnd: i
  viewOnGitHub: Zobacz na GitHubie
---

<section class="hero">
  <div class="container">
    <h1>Zajebiście Przystępne<br><span class="accent">Swift Concurrency</span></h1>
    <p class="subtitle">Zrozum wreszcie async/await, Taski i dlaczego kompilator bez przerwy na Ciebie krzyczy.</p>
    <p class="credit">Wielkie podziękowania dla <a href="https://www.massicotte.org/">Matta Massicotte'a</a> za uczynienie współbieżności w Swift zrozumiałą. Opracowane przez <a href="https://pepicrft.me">Pedro Piñerę</a>, współzałożyciela <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist</a>. Znalazłeś błąd? <a href="https://github.com/tuist/fuckingapproachableswiftconcurrency/issues/new">Zgłoś go</a> lub <a href="https://github.com/tuist/fuckingapproachableswiftconcurrency/pulls">utwórz PR</a>.</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [Kod asynchroniczny: async/await](#async-await)

Większość tego, co robią aplikacje, to czekanie. Pobierają dane z serwera — czekają na odpowiedź. Odczytują plik z dysku — czekają na bajty. Odpytują bazę danych — czekają na wyniki.

Przed systemem współbieżności Swifta to czekanie wyrażało się za pomocą callbacków, delegatów lub [Combine](https://developer.apple.com/documentation/combine). To działa, ale zagnieżdżone callbacki szybko stają się nieczytelne, a Combine ma stromą krzywą uczenia.

`async/await` daje Swiftowi nowy sposób obsługi czekania. Zamiast callbacków piszesz kod, który wygląda jak sekwencyjny — wstrzymuje swoje działanie, czeka i je wznawia. Pod spodem środowisko uruchomieniowe Swifta zarządza tymi pauzami w efektywny sposób. Jednak to, czy Twoja aplikacja faktycznie pozostanie responsywna podczas czekania, zależy od tego, *gdzie* kod jest wykonywany, co omówimy później.

**Funkcja async** to taka, która może potrzebować zatrzymań. Oznaczasz ją `async`, a gdy ją wywołujesz, używasz `await`, żeby powiedzieć „zatrzymaj się tutaj, aż to się skończy":

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // Zawiesza wykonywanie tutaj
    return try JSONDecoder().decode(User.self, from: data)
}

// Wywołanie
let user = try await fetchUser(id: 123)
// Kod tutaj wykonuje się po zakończeniu fetchUser
```

Twój kod zatrzymuje się przy każdym `await` — nosi to nazwę **zawieszenia** (suspension). Gdy praca zostaje wykonana, kod zostaje wznowiony dokładnie tam, gdzie doszło do jego zatrzymania. Zawieszenie daje Swiftowi możliwość wykonywania innej pracy w czasie czekania.

### Czekanie na *nie po kolei*

A co, jeśli musisz pobrać kilka rzeczy? Możesz oczekiwać na wyniki ich działania po kolei:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

Jest to jednak wolne — każde zadanie czeka na zakończenie poprzedniego. Użyj `async let`, żeby uruchomić je równolegle:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // Wszystkie trzy pobierają się równolegle!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

Każda instrukcja `async let` startuje natychmiast. `await` zbiera wyniki.

<div class="tip">
<h4>await wymaga async</h4>

Możesz używać `await` tylko wewnątrz funkcji `async`.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [Zarządzanie pracą: Taski](#tasks)

**[Task](https://developer.apple.com/documentation/swift/task)** to jednostka pracy asynchronicznej, którą możesz zarządzać. Napisałeś funkcje async, ale to Task faktycznie je uruchamia - to sposób na uruchomienie kodu async z kodu synchronicznego, który daje Ci nad nią kontrolę: pozwala poczekać na wynik zadania, anulować jego wykonanie lub pozwolić mu działać w tle.

Załóżmy, że tworzysz ekran profilu. Załaduj awatar, gdy pojawi się widok, używając modyfikatora [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)), który automatycznie anuluje się, gdy widok zniknie:

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

Jeśli użytkownicy mogą przełączać się między profilami, użyj `.task(id:)`, żeby przeładować dane, gdy wybór się zmieni:

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

Gdy użytkownik wybierze „Zapisz", utwórz Task ręcznie:

```swift
Button("Save") {
    Task { await saveProfile() }
}
```

### Dostęp do wyników Tasku

Gdy tworzysz Task, otrzymujesz referencję do niego. Użyj `.value`, żeby poczekać na wynik i go pobrać:

```swift
let handle = Task {
    return await fetchUserData()
}
let userData = await handle.value  // Zawiesza działanie do zakończenia tasku
```

Jest to przydatne, gdy potrzebujesz wyniku później lub gdy chcesz przechować referencję tasku i oczekiwać na jego zakończenie w innym miejscu.

A co, jeśli musisz załadować awatar, bio i statystyki jednocześnie? Użyj [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup), żeby pobrać je równolegle:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

Taski wewnątrz grupy to **taski potomne** (child tasks), powiązane z rodzicem. Kilka rzeczy do zapamiętania:

- **Anulowanie jest propagowane**: anuluj rodzica, a wszystkie dzieci też zostaną anulowane
- **Błędy**: rzucony błąd anuluje sąsiadujące taski (na tym samym poziomie) lub pozostałe zadania potomne i jest ponownie rzucany, ale dopiero gdy konsumujesz wyniki za pomocą `next()`, `waitForAll()` lub iteracji
- **Kolejność zakończenia**: wyniki przychodzą w kolejności kończenia tasków, nie ich dodawania
- **Czeka na wszystkie**: grupa nie zwróci rezultatów dopóki każde z dzieci nie zakończy swojego działania lub nie zostanie anulowane

To jest **[współbieżność strukturalna](https://developer.apple.com/videos/play/wwdc2021/10134/)**: praca zorganizowana w strukturę drzewa, którą łatwo zrozumieć i posprzątać.

  </div>
</section>

<section id="execution">
  <div class="container">

## [Gdzie to wszystko się dzieje: Od wątków do domen izolacji](#execution)

Do tej pory mówiliśmy o tym, *kiedy* kod się wykonuje (async/await) i *jak go organizować* (Taski). Teraz: **gdzie się wykonuje i jak zapewnić mu bezpieczeństwo?**

<div class="tip">
<h4>Większość aplikacji po prostu czeka</h4>

Większość kodu aplikacji zależy głównie od **operacji ograniczonych przez wejście/wyjście (I/O-bound)**. Pobierasz dane z sieci, oczekujesz (await) na odpowiedź, dekodujesz ją i wyświetlasz. Jeśli masz wiele operacji I/O do skoordynowania, sięgasz po *taski* i *grupy tasków*. Faktyczna praca CPU jest minimalna. Główny wątek radzi sobie z tym dobrze, bo `await` zawiesza pracę bez jej blokowania.

Jednak prędzej czy później przyjdzie pora na zadania mocno **ograniczone wydajnością procesora (CPU bound)**: parsowanie gigantycznego pliku JSON, przetwarzanie obrazów, skomplikowane obliczenia. Ta praca nie czeka na nic zewnętrznego. Potrzebuje tylko cykli CPU. Jeśli uruchomisz ją na głównym wątku, dojdzie do zamrożenia Twojego UI. To jest moment, w którym to *gdzie wykonuje się kod* naprawdę ma znaczenie.
</div>

### Stary świat: Wiele opcji, zero bezpieczeństwa

Przed systemem współbieżności Swifta miałeś kilka sposobów zarządzania wykonywaniem:

| Podejście | Co robi | Kompromisy |
|-----------|---------|------------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | Bezpośrednia kontrola wątków | Niskopoziomowe, podatne na błędy, rzadko potrzebne |
| [GCD](https://developer.apple.com/documentation/dispatch) | Kolejki dispatch z domknięciami | Proste, ale bez anulowania, łatwo doprowadzić do eksplozji wątków |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | Zależności tasków, anulowanie, KVO | Więcej kontroli, ale rozwlekłe i ciężkie |
| [Combine](https://developer.apple.com/documentation/combine) | Strumienie reaktywne | Świetne do strumieni zdarzeń, stroma krzywa uczenia |

Wszystkie działały, ale bezpieczeństwo było całkowicie po Twojej stronie. Kompilator nie mógł pomóc, jeśli zapomniałeś dispatchować na main albo jeśli dwie kolejki jednocześnie korzystały z tych samych danych.

### Problem: Wyścigi danych (Data Races)

[Wyścig danych](https://developer.apple.com/documentation/xcode/data-races) (data race) zachodzi, gdy dwa wątki jednocześnie uzyskują dostęp do tego samego miejsca w pamięci, a przynajmniej jeden z nich zapisuje:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// Niezdefiniowane zachowanie: crash, uszkodzenie pamięci lub zła wartość
```

Wyścigi danych to niezdefiniowane zachowanie. Mogą crashować, uszkadzać pamięć lub po cichu dawać złe wyniki. Twoja aplikacja działa świetnie w testach, a potem losowo crashuje na produkcji. Tradycyjne mechanizmy, takie jak blokady (locks) i semafory pomagają, ale są ręczne i podatne na błędy.

<div class="warning">
<h4>Współbieżność potęguje problem</h4>

Im bardziej współbieżna jest Twoja aplikacja, tym bardziej prawdopodobne stają się wyścigi danych. W prostej aplikacji iOS brak dbania o bezpieczeństwo wątków może ujść na sucho, jednak serwer webowy obsługujący tysiące jednoczesnych requestów będzie crashować bez przerwy. To dlatego bezpieczeństwo w czasie kompilacji Swifta ma największe znaczenie w środowiskach o dużej współbieżności.
</div>

### Zmiana: Od wątków do izolacji

Model współbieżności Swifta zadaje inne pytanie. Zamiast „na jakim wątku to powinno działać?", pyta: **„kto ma prawo dostępu do tych danych?"**

To jest [izolacja](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation). Zamiast ręcznie rozdzielać pracę na wątki, deklarujesz granice wokół danych. Kompilator wymusza przestrzeganie tych granic na etapie kompilacji, a nie w czasie wykonywania programu.

<div class="tip">
<h4>Pod spodem</h4>

Swift Concurrency jest zbudowane na [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (tym samym runtimie co GCD). Różnica polega na warstwie czasu kompilacji: aktorzy i izolacja są egzekwowane przez kompilator, podczas gdy runtime zajmuje się planowaniem na [kooperatywnej puli wątków](https://developer.apple.com/videos/play/wwdc2021/10254/) ograniczonej do liczby rdzeni Twojego CPU.
</div>

### Trzy domeny izolacji

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) to [globalny aktor](https://developer.apple.com/documentation/swift/globalactor) reprezentujący domenę izolacji głównego wątku. Jest wyjątkowy, bo frameworki UI (UIKit, AppKit, SwiftUI) wymagają dostępu właśnie do wątku głównego.

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // Chronione przez izolację MainActor
}
```

Gdy oznaczysz coś `@MainActor`, nie mówisz „dispatchuj to na główny wątek". Mówisz „to należy do domeny izolacji głównego aktora". Kompilator wymusza, żeby wszystko, co używa *tego*, było albo na MainActor, albo użyło `await` w celu przekroczenia granicy.

<div class="tip">
<h4>W razie wątpliwości użyj @MainActor</h4>

W przypadku większości aplikacji oznaczenie ViewModeli atrybutem @MainActor to właściwy wybór. Obawy o wydajność są zwykle przesadzone. Zacznij tutaj, optymalizuj tylko wtedy, gdy zmierzysz rzeczywiste problemy.
</div>

**2. Aktorzy (Actors)**

[Aktor](https://developer.apple.com/documentation/swift/actor) chroni swój własny mutowalny stan. Gwarantuje, że tylko jeden fragment kodu może jednocześnie uzyskać dostęp do jego danych:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // Bezpieczne: aktor gwarantuje wyłączny dostęp
    }
}

// Z zewnątrz musisz użyć `await`, żeby przekroczyć granicę
await account.deposit(100)
```

**Aktorzy to nie wątki.** Aktor to granica izolacji. Środowisko uruchomieniowe Swifta decyduje, który wątek faktycznie wykonuje kod aktora. Nie kontrolujesz tego i nie musisz.

**3. Nonisolated**

Kod oznaczony [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) rezygnuje z izolacji aktora. Może być wywołany z dowolnego miejsca bez `await`, ale nie może uzyskać dostępu do chronionego stanu aktora:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // Brak dostępu do stanu aktora, bezpieczne wywołanie z dowolnego miejsca
    }
}

let name = account.bankName()  // Bez await
```

<div class="tip">
<h4>Approachable Concurrency: Mniej barier</h4>

[Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) upraszcza model mentalny za pomocą dwóch ustawień budowania w Xcode:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: Wszystko działa na MainActor, chyba że ustalisz inaczej
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: Funkcje async `nonisolated` zostają w domenie aktora wywołującego zamiast przeskakiwać do wątku w tle

Nowe projekty Xcode 26 mają obydwa te ustawienia włączone domyślnie. Gdy potrzebujesz wytężonej pracy CPU poza głównym wątkiem, użyj `@concurrent`.

<pre><code class="language-swift">// Działa na MainActor (domyślnie)
func updateUI() async { }

// Działa na wątku w tle (opcjonalne)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>Biurowiec</h4>

Pomyśl o swojej aplikacji jak o biurowcu. Każda **domena izolacji** to prywatne biuro z zamkiem w drzwiach. Tylko jedna osoba może być w środku jednocześnie, pracując z dokumentami w tym biurze.

- **`MainActor`** to recepcja — tu odbywają się wszystkie interakcje z klientami. Jest tylko jedna i obsługuje wszystko, co widzi użytkownik.
- **`actor`** to biura departamentów — Księgowość, Dział Prawny, HR. Każdy z nich chroni swoje poufne dokumenty.
- **`nonisolated`** to korytarz — wspólna przestrzeń, przez którą każdy może przejść, ale żadne prywatne dokumenty tu nie leżą.

Nie możesz po prostu wpaść do czyjegoś biura. Pukasz (`await`) i czekasz, aż zostaniesz wpuszczony.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [Co może przekraczać domeny izolacji: Sendable](#sendable)

Domeny izolacji chronią dane, ale w końcu musi dojść do ich przekazania. Gdy to robisz, Swift sprawdza, czy jest to bezpieczne.

Pomyśl o tym: jeśli przekażesz referencję do mutowalnej klasy z jednego aktora do drugiego, oba mogą ją jednocześnie modyfikować. To dokładnie ten wyścig danych, któremu próbujemy zapobiec, więc Swift musi wiedzieć: czy te dane mogą być bezpiecznie współdzielone?

Odpowiedzią jest protokół [`Sendable`](https://developer.apple.com/documentation/swift/sendable). To marker, który mówi kompilatorowi „ten typ jest bezpieczny do przekazywania przez granice izolacji":

- Typy **Sendable** mogą bezpiecznie przekraczać granice (typy wartościowe, niemutowalne dane, aktor)
- Typy **non-Sendable** nie mogą (klasy z mutowalnym stanem)

```swift
// Sendable - to typ wartościowy, każde miejsce dostaje kopię
struct User: Sendable {
    let id: Int
    let name: String
}

// Non-Sendable - to klasa z mutowalnym stanem
class Counter {
    var count = 0  // Dwa miejsca modyfikujące to = katastrofa
}
```

### Tworzenie typów Sendable

Swift automatycznie wnioskuje zgodność z `Sendable` w przypadku wielu typów:

- **Struktury i enumy** zawierające wyłącznie właściwości `Sendable` stają się niejawnie `Sendable`
- typy **aktorów** są zawsze `Sendable`, bo chronią swój własny stan
- **Typy `@MainActor`** są `Sendable`, bo MainActor serializuje dostęp

Sytuacja w przypadku klas jest nieco trudniejsza. Klasa może być zgodna z `Sendable` tylko jeśli jest oznaczona jako `final` i wszystkie jej przechowywane właściwości są niemutowalne:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // Niemutowalne
    let timeout: Double   // Niemutowalne
}
```

Jeśli masz klasę, która jest bezpieczna dla wątków dzięki innym mechanizmom (zamki, zmienne atomowe), możesz użyć [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable), żeby powiedzieć kompilatorowi „zaufaj mi":

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable to obietnica</h4>

Kompilator nie zweryfikuje bezpieczeństwa wątków. Jeśli się mylisz, dojdzie do wyścigów danych. Korzystaj z tej opcji ostrożnie.
</div>

<div class="tip">
<h4>Approachable Concurrency: Mniej tarcia</h4>

Z [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) błędy związane z Sendable występują znacznie rzadziej:

- Jeśli kod pozostaje w obrębie jednej domeny izolacji, zgodność z Sendable nie jest wymagana
- Funkcje async zostają w domenie aktora wywołującego zamiast przenosić wykonanie na wątek w tle
- Kompilator jest sprytniejszy w wykrywaniu, kiedy wartości są używane bezpiecznie

Aktywuj tę opcję ustawiając `SWIFT_DEFAULT_ACTOR_ISOLATION` na `MainActor` i `SWIFT_APPROACHABLE_CONCURRENCY` na `YES`. Nowe projekty Xcode 26 mają je obie włączone domyślnie. Gdy potrzebujesz współbieżności, oznacz funkcje jako `@concurrent` i dopiero wtedy pomyśl o Sendable.
</div>

<div class="analogy">
<h4>Kserokopie vs oryginalne dokumenty</h4>

Wracamy do biurowca. Gdy musisz dzielić się informacjami między departamentami:

- **Kserokopie są bezpieczne** — Jeśli Dział Prawny zrobi kopię dokumentu i wyśle ją do Księgowości, oba mają swoją własną kopię. Mogą na nich bazgrać, modyfikować, cokolwiek. Żadnego konfliktu.
- **Oryginalne podpisane umowy muszą zostać na miejscu** — Jeśli dwa departamenty mogłyby modyfikować oryginał, zapanuje chaos. Kto ma prawdziwą wersję?

Typy `Sendable` są jak kserokopie: bezpieczne do współdzielenia, bo każde miejsce dostaje swoją niezależną kopię (typy wartościowe) lub ponieważ są niemutowalne (nikt nie może ich modyfikować). Typy nie-`Sendable` są jak oryginalne umowy: przekazywanie ich stwarza ryzyko sprzecznych modyfikacji.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [Jak izolacja jest dziedziczona](#isolation-inheritance)

Wiesz już, że domeny izolacji chronią dane, a Sendable kontroluje, co między nimi przechodzi. Jednak jak kod w ogóle trafia do domeny izolacji?

Gdy wywołujesz funkcję lub tworzysz domknięcie, izolacja przepływa przez Twój kod. Z [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) Twoja aplikacja startuje na [`MainActor`](https://developer.apple.com/documentation/swift/mainactor) i jego izolacja jest propagowana do kodu, który wywołujesz, chyba że coś jawnie ją zmieni. Zrozumienie tego przepływu pomaga przewidywać, gdzie kod się wykonuje i dlaczego kompilator czasem narzeka.

### Wywołania funkcji

Gdy wywołujesz funkcję, jej izolacja określa, gdzie dochodzi do jej wykonania:

```swift
@MainActor func updateUI() { }      // Zawsze działa na MainActor
func helper() { }                    // Dziedziczy domenę izolacji wywołującego
@concurrent func crunch() async { }  // Działa jawnie poza aktorem
```

Z [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) większość Twojego kodu dziedziczy domenę izolacji `MainActor`. Funkcja jest wykonywana tam, gdzie jej wywołujący, o ile nie dojdzie do jawnej rezygnacji z tej opcji.

### Domknięcia (closures)

Domknięcia dziedziczą izolację z kontekstu, w którym zostały zdefiniowane:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // Dziedziczy MainActor z ViewModel
            self.updateUI()  // Bezpieczne, ta sama domena izolacji
        }
        closure()
    }
}
```

Dlatego domknięcia akcji `Button` w SwiftUI mogą bezpiecznie aktualizować `@State`: dziedziczą izolację MainActor z widoku.

### Zadania (Tasks)

`Task { }` dziedziczy izolację aktora z miejsca, w którym został utworzony:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // Dziedziczy domenę izolacji MainActora
            self.updateUI()  // Bezpieczne, bez await
        }
    }
}
```

To zazwyczaj jest to, czego chcesz. Task działa na tym samym aktorze co kod, który go utworzył.

### Przerwanie dziedziczenia: Task.detached

Czasem potrzebujesz zadania, które nie odziedziczy żadnego kontekstu:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // Bez izolacji aktora, działa w kooperatywnej puli
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // Jawny skok z powrotem
            }
        }
    }

    nonisolated func expensiveCalculation() async -> Data {
        // Praca intensywnie obciążająca CPU
    }
}
```

<div class="warning">
<h4>Task i Task.detached to antywzorzec</h4>

Taski tworzone ręcznie za pomocą `Task { ... }` nie są zarządzane. Nie możesz ich anulować ani wiedzieć, kiedy zakończą pracę. Nie masz dostępu do zwracanej przez nie wartości ani informacji, czy napotkały błąd. W większości przypadków lepiej jest używać tasków zarządzanych przez `.task` lub `TaskGroup`, [jak wyjaśniono w sekcji „Częste błędy”](#managedtasks).

[Task.detached powinien być ostatecznością](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). Odłączone taski nie dziedziczą priorytetu, wartości task-local ani kontekstu aktora. Jeśli potrzebujesz cięższej pracy CPU poza głównym aktorem, oznacz funkcję jako `@concurrent`.
</div>

### Zachowanie izolacji w narzędziach async

Czasem piszesz ogólną funkcję async, która przyjmuje domknięcie — wrapper, funkcję pomocniczą do ponownych prób, określenia zakresu transakcji. Wywołujący przekazuje domknięcie, Twoja funkcja je uruchamia. Proste, prawda?

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

Jednak gdy wywołujesz to z kontekstu `@MainActor`, Swift narzeka:

<div class="compiler-error">
Sending value of non-Sendable type '() async throws -> T' risks causing data races
</div>

Co się dzieje? Twoje domknięcie przechwytuje stan z MainActora, ale funkcja `measure` jest oznaczona jako `nonisolated`. Swift widzi domknięcie non-Sendable przekraczające granicę izolacji — dokładnie to, czemu ma zapobiegać.

Najprostszym rozwiązaniem jest `nonisolated(nonsending)`. To mówi Swiftowi, że funkcja powinna zostać na tym samym kontekście wykonawczym (executorze), który ją wywołał:

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

Teraz cała funkcja działa na executorze wywołującego. Wywołaj ją z MainActor, a zostanie na MainActor. Wywołaj z własnego aktora, a zostanie tam. Domknięcie nigdy nie przekracza granicy izolacji, więc żadne sprawdzenie Sendable nie jest potrzebne.

<div class="tip">
<h4>Kiedy używać którego podejścia</h4>

**`nonisolated(nonsending)`** — Prosty wybór. Po prostu dodaj atrybut. Użyj tego, gdy musisz po prostu zostać na executorze wywołującego.

**`isolation: isolated (any Actor)? = #isolation`** — Jawny wybór. Dodaje parametr dający dostęp do instancji aktora. Użyj tego, gdy musisz przekazać kontekst izolacji do innych funkcji lub sprawdzić, na jakim aktorze jesteś.
</div>

Jeśli potrzebujesz jawnego dostępu do aktora, użyj parametru [`#isolation`](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/expressions/#Isolation-Expression):

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

Oba podejścia są niezbędne do budowania narzędzi async, które mają być przyjemne w użyciu. Bez nich wywołujący musieliby oznaczać swoje domknięcia jako `@Sendable` lub kombinować, żeby zadowolić kompilator.

<div class="analogy">
<h4>Spacer po biurowcu</h4>

Gdy jesteś w biurze recepcji (MainActor) i wywołujesz kogoś do pomocy, ta osoba przychodzi do *Twojego* biura, czyli "dziedziczy Twoją lokalizację". Jeśli tworzysz zadanie („zrób to dla mnie"), asystent również zaczyna w Twoim biurze.

Jedyny sposób, żeby ktoś trafił do innego biura, to jawne pójście tam i powiedzenie: "Muszę popracować nad tym w Księgowości" (`actor`), lub „Zajmę się tym w biurze na zapleczu" (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [Łączenie wszystkiego w całość](#putting-it-together)

Cofnijmy się i zobaczmy, jak wszystkie elementy do siebie pasują.

Swift Concurrency może wydawać się mnóstwem koncepcji: `async/await`, `Task`, aktorzy, `MainActor`, `Sendable`, domeny izolacji. Ale tak naprawdę jest tylko jedna idea w centrum tego wszystkiego: **izolacja jest domyślnie dziedziczona**.

Z włączonym [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) Twoja aplikacja startuje na [`MainActor`](https://developer.apple.com/documentation/swift/mainactor). To Twój punkt wyjścia. Stamtąd:

- Każda wywoływana funkcja **dziedziczy** tę izolację
- Każde tworzone domknięcie **przechwytuje** tę izolację
- Każdy uruchamiany [`Task { }`](https://developer.apple.com/documentation/swift/task) **dziedziczy** tę izolację

Nie musisz niczego oznaczać. Nie musisz myśleć o wątkach. Twój kod działa na `MainActor`ze, a izolacja po prostu jest propagowana automatycznie.

Gdy musisz przerwać tę sekwencję dziedziczenia, robisz to w sposób jawny:

- **`@concurrent`** mówi „uruchom to na wątku w tle"
- **`actor`** mówi „ten typ ma swoją własną domenę izolacji"
- **`Task.detached { }`** mówi „zacznij od nowa, nie dziedzicz niczego"

A gdy przekazujesz dane między domenami izolacji, Swift sprawdza, czy jest to bezpieczne. Do tego służy [`Sendable`](https://developer.apple.com/documentation/swift/sendable): oznaczanie typów, które mogą bezpiecznie przekraczać granice.

To wszystko. To cały model:

1. **Izolacja jest propagowana** z `MainActor`a przez Twój kod
2. **Jawnie rezygnujesz**, gdy potrzebujesz pracy w tle lub oddzielnego stanu
3. **Sendable pilnuje granic**, gdy dane przekraczają domeny izolacji

Gdy kompilator narzeka, mówi Ci, że jedna z tych reguł została naruszona. Prześledź dziedziczenie: skąd wzięła się izolacja? Gdzie ma dojść do wykonania kodu? Jakie dane przekraczają granicę? Odpowiedź jest zwykle oczywista, gdy zadasz właściwe pytanie.

### Co dalej

Dobra wiadomość: nie musisz opanować wszystkiego w jednej chwili.

**Większość aplikacji potrzebuje zaledwie podstaw.** Oznacz swoje ViewModele jako `@MainActor`, użyj `async/await` do zapytań sieciowych i utwórz `Task { }`, gdy musisz uruchomić asynchroniczne zadanie po naciśnięciu przycisku. To wszystko. To obsługuje 80% przypadków w rzeczywistych aplikacjach. Kompilator powie Ci, jeśli będziesz potrzebować czegoś więcej.

**Gdy potrzebujesz pracy równoległej**, sięgnij po `async let`, żeby pobrać wiele rzeczy naraz lub [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup), gdy liczba tasków jest dynamiczna. Naucz się obsługiwać anulowanie z gracją. To obejmuje aplikacje ze złożonym ładowaniem danych lub funkcjami czasu rzeczywistego.

**Zaawansowane wzorce przychodzą później**, jeśli w ogóle do tego dojdzie. Własne typy aktorów do współdzielenia mutowalnego stanu, `@concurrent` do przetwarzania intensywnego dla CPU czy głębokie zrozumienie `Sendable` to tematy związane z kodem frameworków, serwerami w Swift i złożonymi aplikacjami desktopowymi. Większość programistów nigdy nie będzie ich potrzebować.

<div class="tip">
<h4>Zacznij powoli</h4>

Nie optymalizuj rozwiązań problemów, których nie masz. Zacznij od podstaw, wydaj swoją aplikację i dodawaj złożoność tylko wtedy, gdy zajdzie taka potrzeba. Kompilator Cię poprowadzi.
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [Uwaga: Częste błędy](#mistakes)

### Myślenie, że async = działanie w tle

```swift
// To NADAL blokuje główny wątek!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // Praca synchroniczna = blokowanie
    data = result
}
```

`async` oznacza „możliwe wstrzymanie wykonania". Faktyczna praca nadal wykonuje się tam, gdzie ma się wykonać. Użyj `@concurrent` (Swift 6.2) lub `Task.detached` do wytężonej pracy CPU.

### Tworzenie zbyt wielu aktorów

```swift
// Przekombinowane
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// Lepiej - większość obiektów może korzystać z domeny MainActora
@MainActor
class AppState { }
```

Potrzebujesz własnego aktora tylko wtedy, gdy masz współdzielony mutowalny stan, który nie może korzystać z domeny `MainActor`a. [Reguła Matta Massicotte'a](https://www.massicotte.org/actors/): wprowadź aktora wyłącznie gdy (1) masz stan nie-`Sendable`, (2) operacje na tym stanie muszą być atomowe i (3) operacje te nie mogą zostać wywołane na istniejącym aktorze. Jeśli nie możesz tego uzasadnić, użyj `@MainActor`.

### Oznaczanie wszystkiego jako Sendable

Nie wszystko musi przekraczać granice izolacji. Jeśli dodajesz `@unchecked Sendable` wszędzie, cofnij się i zapytaj, czy dane faktycznie muszą się przemieszczać między domenami.

### Używanie MainActor.run, gdy nie ma takiej konieczności

```swift
// Zbędne
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// Lepiej - po prostu oznacz funkcję jako @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` rzadko jest właściwym rozwiązaniem. Jeśli potrzebujesz izolacji MainActor, oznacz funkcję jako `@MainActor`. Jest to rozwiązanie bardziej przejrzyste i kompilator może Ci bardziej pomóc. Zobacz [opinię Matta na ten temat](https://www.massicotte.org/problematic-patterns/).

### Blokowanie kooperatywnej puli wątków

```swift
// NIGDY tego nie rób - ryzyko zakleszczenia (deadlocka)
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // Blokuje wątek kooperatywny!
}
```

Kooperatywna pula wątków Swifta ma ograniczoną liczbę wątków. Blokowanie jednego za pomocą `DispatchSemaphore`, `DispatchGroup.wait()` lub podobnych wywołań może doprowadzić do zakleszczenia (deadlock). Jeśli musisz połączyć kod synchroniczny z asynchronicznym, użyj `async let` lub zrefaktoryzuj rozwiązanie, aby działało w pełni asynchronicznie.

<div id="managedtasks">

### Tworzenie nieustrukturyzowanych tasków

Taski tworzone ręcznie za pomocą `Task { ... }` lub `Task.detached { ... }` nie są zarządzane. Po ich utworzeniu nie możesz ich kontrolować. Nie możesz ich anulować, jeśli task, z którego je uruchomiłeś, zostanie anulowany. Nie masz dostępu do zwracanej przez nie wartości ani nie wiesz, czy zakończyły pracę ani, czy może napotkały błąd. Uruchomienie takiego tasku jest jak wrzucenie butelki do morza z nadzieją, że dostarczy wiadomość, bez możliwości ponownego zobaczenia tej butelki.

<div class="analogy">
<h4>Biurowiec</h4>

`Task` to jak przydzielenie pracy pracownikowi. Pracownik obsługuje żądanie (włączając w to oczekiwanie na inne biura), podczas gdy Ty kontynuujesz swoją bieżącą pracę.

Po tym, jak przekażesz pracę pracownikowi, nie masz środków komunikacji z nim. Nie możesz mu powiedzieć, żeby przestał, ani wiedzieć, czy skończył i jaki był wynik tej pracy.

W rzeczywistości chcesz dać pracownikowi krótkofalówkę, gdy wykonuje powierzone zadanie. Dzięki temu możesz mu powiedzieć, żeby przestał, a on może Cię poinformować, gdy napotka błąd lub zaraportować wynik końcowy.
</div>

Zamiast tworzyć niezarządzane taski, użyj współbieżności Swifta, żeby zachować kontrolę nad tworzonymi zadaniami potomnymi. Użyj `TaskGroup` do zarządzania ich grupą. Swift udostępnia kilka funkcji `withTaskGroup() { group in ... }`, żeby ułatwić tworzenie grup zadań.

```swift
func doWork() async {

    // zwróci wynik, gdy wszystkie zadania potomne (subtaski) zakończą swoje działanie
    let result = try await withThrowingTaskGroup() { group in
        group.addTask {
            try await self.performAsyncOperation1()
        }
        group.addTask {
            try await self.performAsyncOperation2()
        }
        // poczekaj na wyniki tasków i zbierz je tutaj
    }
}

func performAsyncOperation1() async throws -> Int {
    return 1
}
func performAsyncOperation2() async throws -> Int {
    return 2
}
```

Żeby zebrać wyniki zadań potomnych grupy, możesz użyć pętli for-await-in:

```swift
var sum = 0
for await result in group {
    sum += result
}
// sum == 3
```

Więcej o [TaskGroup](https://developer.apple.com/documentation/swift/taskgroup) znajdziesz w dokumentacji Swift.

#### Uwaga o Taskach i SwiftUI

Budując UI często chcesz uruchomić asynchroniczne zadania z kontekstu synchronicznego. Na przykład chcesz asynchronicznie załadować obraz w odpowiedzi na interakcję z elementem UI. Uruchamianie zadań tego typu z kontekstu synchronicznego nie jest możliwe w Swift. Dlatego widzisz rozwiązania z `Task { ... }`, które wprowadzają nieustrukturyzowane zadania.

Nie możesz użyć `TaskGroup` z synchronicznego modyfikatora SwiftUI, bo `withTaskGroup()` też jest funkcją async, tak jak jej powiązane funkcje.

Alternatywnie SwiftUI oferuje asynchroniczny modyfikator, którego możesz użyć do uruchomienia operacji asynchronicznych. Modyfikator `.task { }`, o którym już wspominaliśmy, przyjmuje funkcję `() async -> Void`, idealną do wywoływania innych funkcji `async`. Jest dostępny w każdym `View` i wywoływany przed jego wyświetleniem, a tworzone w ten sposób taski stają się związane z jego cyklem życia i są anulowane w momencie jego zniknięcia.

Wracając do przykładu z interakcją do załadowania obrazu: zamiast tworzyć nieustrukturyzowany task do wywołania asynchronicznej funkcji `loadImage()` z synchronicznej funkcji `.onTap() { ... }`, możesz przełączyć flagę stanu i użyć modyfikatora `task(id:)` do asynchronicznego ładowania obrazów, gdy wartość `id` (flaga) ulegnie zmianie.

Oto przykład:

```swift
struct ContentView: View {

    @State private var shouldLoadImage = false

    var body: some View {
        Button("Click Me !") {
            // przełącz flagę
            shouldLoadImage = !shouldLoadImage
        }
        // Widok zarządza subtaskiem
        // startuje przed wyświetleniem widoku
        // i zatrzymuje się gdy widok jest ukryty
        .task(id: shouldLoadImage) {
            // gdy wartość flagi się zmieni, SwiftUI restartuje task
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

## [Ściągawka: Szybki przegląd](#glossary)

| Słowo kluczowe | Co robi |
|----------------|---------|
| `async` | Oznacza funkcję jako wstrzymywalną |
| `await` | Wstrzymuje funkcję aż do zakończenia zadania |
| `Task { }` | Uruchamia asynchroniczne zadanie, dziedziczy kontekst |
| `Task.detached { }` | Uruchamia asynchroniczne zadanie bez dziedziczonego kontekstu |
| `@MainActor` | Powoduje działanie na głównym wątku |
| `actor` | Typ z izolowanym mutowalnym stanem |
| `nonisolated` | Prowadzi do rezygnacji z izolacji aktora |
| `nonisolated(nonsending)` | Gwarantuje pozostanie w kontekście wykonawczym (executorze) wywołującego |
| `Sendable` | Oznacza model jako bezpieczny do przekazywania między domenami izolacji |
| `@concurrent` | Wywołuje zadanie zawsze na wątku w tle (Swift 6.2+) |
| `#isolation` | Przechwytuje izolację wywołującego jako parametr |
| `async let` | Uruchamia pracę równoległą |
| `TaskGroup` | Tworzy dynamiczną grupę pracy równoległej |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [Dalsza lektura](#further-reading)

<div class="resources">
<h4>Blog Matta Massicotte'a (Gorąco polecane)</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - Niezbędna terminologia
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - Kluczowa koncepcja
- [When should you use an actor?](https://www.massicotte.org/actors/) - Praktyczne wskazówki
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - Dlaczego prostsze jest lepsze
</div>

<div class="resources">
<h4>Oficjalne zasoby Apple</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>Narzędzia</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) - Wypuszczaj szybciej z większymi zespołami i bazami kodu
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [Umiejętność agenta AI](#ai-skill)

Chcesz, żeby Twój asystent kodowania AI rozumiał Swift Concurrency? Udostępniamy plik **[SKILL.md](/SKILL.md)**, który pakuje te modele mentalne dla agentów AI takich jak Claude Code, Codex, Amp, OpenCode i inne.

### Inne umiejętności

- <a href="https://github.com/AvdLee/Swift-Concurrency-Agent-Skill" target="_blank" rel="noreferrer noopener">Open-source'owy skill Swift Concurrency dla agentów od Antoine'a</a>

<div class="tip">
<h4>Czym jest umiejętność (Skill)?</h4>

Umiejętność to plik markdown, który uczy agenty kodowania AI specjalistycznej wiedzy. Gdy dodasz umiejętność Swift Concurrency do swojego agenta, automatycznie zastosuje te koncepcje, pomagając Ci pisać asynchroniczny kod w Swift.
</div>

### Jak używać

Wybierz swojego agenta i uruchom poniższe komendy:

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
# Osobista umiejętność (wszystkie Twoje projekty)
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Umiejętność projektu (tylko ten projekt)
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Instrukcje projektu (zalecane)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Globalne instrukcje (wszystkie Twoje projekty)
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Instrukcje projektu (tylko ten projekt)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>

  <div class="code-tab-content">

```bash
# Globalne reguły (wszystkie Twoje projekty)
mkdir -p ~/.kiro/steering
curl -o ~/.kiro/steering/swift-concurrency.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Reguły projektu (tylko ten projekt)
mkdir -p .kiro/steering
curl -o .kiro/steering/swift-concurrency.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>

  <div class="code-tab-content">

```bash
# Globalne reguły (wszystkie Twoje projekty)
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Reguły projektu (tylko ten projekt)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

Umiejętność zawiera analogię biurowca, wzorce izolacji, wskazówki dotyczące Sendable, częste błędy i tabele do szybkiego przeglądu. Twój agent będzie automatycznie korzystać z tej wiedzy, gdy pracujesz z kodem Swift Concurrency.

  </div>
</section>
