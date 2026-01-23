---
layout: base.njk
title: Kahrolası Approachable Swift Concurrency
description: Swift Concurrency üzerine, lafı dolandırmayan bir rehber. async/await, actors, Sendable ve MainActor kavramlarını basit mental modellerle öğrenin. Karmaşık terimler yok, sadece net açıklamalar var.
lang: tr
dir: ltr
nav:
  async-await: Async/Await
  tasks: Task'lar
  execution: İzolasyon
  sendable: Sendable
  putting-it-together: Özet
  mistakes: Yaygın Hatalar
footer:
  madeWith: Biraz hayal kırıklığı, çokça sevgiyle hazırlandı. Çünkü Swift Concurrency bu kadar kafa karıştırıcı olmak zorunda değil.
  tradition: Geleneği devam ettirerek...
  traditionAnd: ve
  viewOnGitHub: GitHub'da Görüntüle
---

<section class="hero">
  <div class="container">
    <h1>Kahrolası<br><span class="accent">Swift Concurrency</span></h1>
    <p class="subtitle">Artık async/await’i, Task’leri ve Compiler’ın sana neden durmadan bağırdığını anla.</p>
    <p class="credit">Swift Concurrency’yi anlaşılır hâle getirdiği için <a href="https://www.massicotte.org/">Matt Massicotte’a </a> büyük teşekkürler. Hazırlayan: <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist'in kurucu ortağı</a> <a href="https://pepicrft.me">Pedro Piñera</a>. Bir hata görürseniz: <a href="https://github.com/tuist/fuckingapproachableswiftconcurrency/issues/new">Bir issue</a> ya da <a href="https://github.com/tuist/fuckingapproachableswiftconcurrency/pulls">PR oluşturun</a>.</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [Asenkron Kodlama: async/await](#async-await)

Uygulamaların yaptığı işlerin büyük bir kısmı beklemektir. Bir sunucudan veri alırsın yanıtı beklersin. Diskten bir dosya okursun baytları beklersin. Bir veritabanını sorgularsın sonuçları beklersin.

Swift Concurrency'den önce bu beklemeyi callback'ler, delegate'ler veya [Combine](https://developer.apple.com/documentation/combine) ile ifade ederdin. Hepsi çalışır, ancak iç içe geçmiş callback'leri takip etmek zorlaşır ve Combine'ın öğrenme eğrişi oldukça diktir.

`async/await` Swift'e bu beklemeleri ele almak için yeni bir yol sunar. Callback'ler yerine ardışık gibi görünen bir kod yazarsın — kod duraklar, bekler ve  kaldığı yerden devam eder. Arka planda Swift'in çalışma zamanı (runtime) bu duraklamaları verimli bir şekilde yönetir.
Ancak beklerken uygulamanın gerçekten tepkisel (responsive) kalması, kodun *nerede* çalıştığına bağlıdır; buna ilerde değineceğiz.

**Asenkron bir fonksiyon**, duraklamaya ihtiyaç duyabilecek bir fonksiyondur. Bu tür bir fonksiyonu `async` keyword'ü ile işaretlersin ve onu çağırırken `await` keyword'ünü kullanarak “bu işlem bitene kadar burada bekle” demiş olursun.

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // Burada duraklar
    return try JSONDecoder().decode(User.self, from: data)
}

// Çağrılır
let user = try await fetchUser(id: 123)
// Bu satırdaki kod fetchUser tamanlandıktan sonra çalıştırılır.
```

Kodun, her `await` noktasında duraklar - buna **suspension** denir. İş tamamlandığında, kod kaldığı yerden aynen devam eder.
Suspension, Swift’e bekleme sırasında başka işler yapma fırsatı verir.

### *Çoklu* işlemler için beklemek

Birden fazla şeyi fetch'lemen gerekirse ne olur? Bunları sırayla, her biri için await kullanarak bekleyebilirsin:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

Ancak bu yavaştır - her işlem, bir öncekinin tamamlanmasını bekler. Bunları paralel çalıştırmak için `async let` kullan:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // Bunların üçü de paralel olarak fetchleniyor!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

Her `async let` ifadesi tanımlandığı an çalışmaya başlar. `await` ile sonuçlar toplanır.

<div class="tip">
<h4>await için async bir bağlam gerekir</h4>

`await` ifadesini yalnızca `async` bir fonksiyon içerisinde kullanabilirsin.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [İşleri Yönetmek: Task'lar](#tasks)

**[Task](https://developer.apple.com/documentation/swift/task)**, yönetilebilir bir asenkron iş birimidir. Yazdığınız asenkron fonksiyonlar, bir task aracılığıyla yürütülür. Senkron kod içerisinden asenkron kodu bu şekilde başlatırsınız; task size bu iş üzerinde kontrol imkanı tanır: sonucunu bekleyebilir, iptal edebilir veya arka planda çalışmasına izin verebilirsiniz.

Diyelim ki bir profil ekranı geliştiriyorsunuz. İlgili view ekranda belirdiğinde avatarı yüklemek için [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)) modifier'ını kullanın bu aynı zamanda view ekrandan kaybolduğunda otomatik olarak ilgili task'ın iptal edilmesini sağlar:

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
Eğer kullanıcılar farklı profiller arasında geçiş yapabiliyorsa `.task(id:)` kullanılarak seçim değiştiğinde yeniden yükleme sağlanabilir:

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

Kullanıcı "Save" butonuna bastığında ilgili async fonksiyonu çağırmak için Task'i manuel olarak oluşturmalıyız:

```swift
Button("Save") {
    Task { await saveProfile() }
}
```

### Task Sonuçlarına Erişim

Bir Task oluşturduğunuzda, bir handle alırsınız. Sonucu beklemek ve almak için `.value` kullanın:

```swift
let handle = Task {
    return await fetchUserData()
}
let userData = await handle.value  // Task tamamlanana kadar askıya alır
```

Bu, sonuca daha sonra ihtiyacınız olduğunda veya task handle'ını saklayıp başka bir yerde await etmek istediğinizde kullanışlıdır.

Peki ya avatar, biyografi ve istatistiklerin hepsini aynı anda yüklemeniz gerekirse? Bunları paralel olarak fetch'lemek için bir [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) kullanın:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```


Grup içindeki task'ler, parent task'e bağlı **child task'lerdir** . Bilmeniz gereken birkaç önemli nokta şunlardır:
- **İptal İşlemi Yayılır**: Parent task'i iptal ederseniz, tüm child task'ler de iptal edilir.
- **Hatalar**: Fırlatılan bir hata, diğer child task'leri de iptal eder ve hatayı yukarı iletir (rethrow); ancak bu yalnızca sonuçları `next()`, `waitForAll()` veya döngü ile işlediğinizde gerçekleşir.
- **Tamamlanma Sırası**: Sonuçlar, task'leri eklediğiniz sırayla değil, bitiş sıralarına göre gelir.
- **Hepsini Bekler**: Grup, her bir child task tamamlanana veya iptal edilene kadar geri dönmez.

İşte bu yapıya, **[structured concurrency](https://developer.apple.com/videos/play/wwdc2021/10134/)** denir: Hakkında mantık yürütmesi ve temizlemesi kolay, ağaç yapısında organize edilmiş bir iş akışı.

  </div>
</section>

<section id="execution">
  <div class="container">

## [Kodun Çalıştığı Yer: Thread’lerden İzolasyon Alanlarına](#execution)

Şu ana kadar kodun *ne* zaman çalıştığından (async/await) ve *nasıl organize edileceğinden* (Tasks) bahsettik. Şimdi ise: **Bu kod nerede çalışıyor ve onu nasıl güvende tutuyoruz?** konusunu ele alacağız.

<div class="tip">
<h4>Çoğu uygulama sadece bekliyor</h4>

Uygulama kodlarının çoğu **I/O-bound** işlemlerden oluşur. Bir ağdan veri çeker, yanıtı *await* ile bekler, decode eder ve görüntülersiniz. Koordinasyon gerektiren birden fazla I/O işleminiz varsa, *task'lere* ve *task group'lara* başvurursunuz. Asıl işlemci kullanımı minimum düzeydedir. `await` işlemi, thread'i bloklamadan askıya aldığı (suspend) için main thread bu yükün altından rahatlıkla kalkabilir.

Ancak er ya da geç, **CPU-bound (işlemci odaklı)** işlemler de yapmanız gerekir: Dev bir JSON dosyasını parse'lamak, görselleri işlemek veya karmaşık hesaplamalar yapmak gibi. Bu tür işlerin harici bir şeyi beklemesi gerekmez; sadece CPU cycle'larına ihtiyaç duyarlar. Eğer bunları main thread üzerinde çalıştırırsanız, kullanıcı arayüzünüz donar. İşte 'kodun nerede çalıştığı' sorusu asıl burada önem kazanır.

</div>

### Eski Dünya: Çok Seçenek, Sıfır Güvenlik

Swift Concurrency'den önce, kodun yürütülmesini yönetmek için birkaç farklı yolunuz vardı:

| Yaklaşım | Ne Yapar? | Dezavantajları (Tradeoffs) |
|----------|--------------|-----------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | Doğrudan thread kontrolü sağlar. | Low-level, hataya müsait, nadiren ihtiyaç duyulur. |
| [GCD](https://developer.apple.com/documentation/dispatch) | Closure'lar ile DispatchQueue'ları yönetir.| Basittir ancak iptal mekanizması yoktur, kolayca thread explosion dediğimiz olaya yol açabilir. |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | Task bağımlılıkları, iptal mekanizması ve KVO desteği sunar. | Daha fazla kontrol sağlar ancak çok kelime gerektirir (verbose) ve hantaldır. |
| [Combine](https://developer.apple.com/documentation/combine) | Reaktif veri akışları sağlar. | Event stream'ler için harikadır, ancak öğrenme eğrisi oldukça diktir. |

Bunların hepsi bir şekilde çalışıyordu ancak güvenlik tamamen sizin sorumluluğunuzdaydı. main thread'e dönmeyi unuttuğunuzda veya iki farklı queue aynı veriye aynı anda eriştiğinde compiler size yardımcı olamazdı.

### Sorun: Data Race'ler

Bir [data race](https://developer.apple.com/documentation/xcode/data-races); iki farklı thread'in aynı anda aynı bellek adresine erişmesi ve bu erişimlerden en az birinin yazma (writing) işlemi olması durumunda meydana gelir:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// Belirsiz davranış: crash, bellek bozulması veya yanlış değer
```

Data Race'ler, belirsiz davranışlara yol açar. Uygulamanın çökmesine, belleğin bozulmasına veya sessizce yanlış sonuçlar üretilmesine neden olabilirler. Uygulamanız test aşamasında gayet iyi çalışırken, canlı kullanımda rastgele zamanlarda çökebilir. Lock ve semaphore gibi geleneksel araçlar yardımcı olur; ancak bunlar manuel yönetilir ve hataya çok müsaittirler.

<div class="warning">
<h4>Concurrency bu sorunu daha da büyütür</h4>

Uygulamanız ne kadar concurrent çalışırsa, data race yaşama olasılığınız o kadar artar. Basit bir iOS uygulaması, özensiz yazılmış bir thread güvenliği ile durumu bir şekilde idare edebilir. Ancak aynı anda binlerce isteği işleyen bir web sunucusu sürekli çökecektir. Swift'in compile-time safety yapısı, işte bu yüzden yoğun concurrency'nin olduğu ortamlarda hayati önem taşır.
</div>

### Geçiş: Thread'lerden İzolasyona

Swift'in Concurrency modeli 'Bu kod hangi thread üzerinde çalışmalı?' sorusu yerine, **'Bu veriye erişmeye kimin izni var?'** sorusuna odaklanır.

İşte bu, [izolasyondur](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation). İşleri manuel olarak thread'lere dağıtmak (dispatching) yerine, verilerin etrafına sınırlar çizersiniz. Compiler bu sınırları çalışma zamanında değil, daha kodunuzu derlediğiniz anda denetleyerek kurallara uyulmasını sağlar.

<div class="tip">
<h4>Arka planda neler oluyor?</h4>

Swift Concurrency, [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (GCD ile aynı runtime) üzerine inşa edilmiştir. Aradaki fark, derleme zamanı (compile-time) katmanıdır: Actor'ler ve izolasyon compiler tarafından denetlenirken; runtime'da, işlerin planlanmasını (scheduling) işlemcinizin çekirdek sayısıyla sınırlı bir [cooperative thread pool](https://developer.apple.com/videos/play/wwdc2021/10254/) üzerinden yönetilir.
</div>

### Üç İzolasyon Alanı

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor), main thread'in izolasyon alanını temsil eden bir [global actor](https://developer.apple.com/documentation/swift/globalactor) yapısıdır. Özel bir konuma sahiptir; çünkü kullanıcı arayüzü framework'leri (UIKit, AppKit, SwiftUI) main thread üzerinden erişim gerektirir.

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // MainActor izolasyonu tarafından korunur.
}
```

Bir şeyi `@MainActor` ile işaretlediğinizde, 'bunu main thread'e gönder' demiş olmazsınız. Bunun yerine, 'bu yapı main actor'ün izolasyon alanına aittir' demiş olursunuz. Compiler, bu yapıya erişmeye çalışan her şeyin ya zaten MainActor üzerinde olmasını ya da bu sınırı geçmek için `await` kullanmasını zorunlu kılar.

<div class="tip">
<h4>Şüpheye düştüğünüzde @MainActor kullanın</h4>

Çoğu uygulama için ViewModel'lerinizi `@MainActor` ile işaretlemek en doğru seçimdir. Performans konusundaki endişeler genellikle abartılır. Bu şekilde başlayın; yalnızca gerçek bir sorun tespit eder ve bunu ölçebilirseniz optimizasyon yoluna başvurun.
</div>

**2. Actor'ler**

Bir [actor](https://developer.apple.com/documentation/swift/actor), kendi değiştirilebilir durumunu (mutable state) korur. Aynı anda yalnızca tek bir kod parçasının kendi verilerine erişebileceğini garanti eder:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // Güvenli: actor tekil erişimi garanti eder.
    }
}

// Dışarıdan erişirken, bu sınırı geçmek için await kullanmak zorundasın
await account.deposit(100)
```

**Actor'ler thread değildir**. Actor, bir izolasyon sınırıdır. Actor kodunu gerçekte hangi thread'in yürüteceğine Swift runtime'ı karar verir. Bunu siz kontrol etmezsiniz ve buna ihtiyacınız da yoktur.

**3. Nonisolated (İzolasyon Dışı)**

[`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) olarak işaretlenen kodlar, actor izolasyonunun dışında kalmayı seçer. Bu kodlar herhangi bir yerden `await` kullanmadan çağrılabilir; ancak actor'ün korunan durumuna (protected state) erişemezler:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // Actor state'ine erişilmiyor, her yerden çağrılması güvenli
    }
}

let name = account.bankName()  // await kullanmaya gerek yok
```

<div class="tip">
<h4>Approachable Concurrency: Daha Az Sıkıntı</h4>

[Approachable Concurrency](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html), kafanızı iki yeni Xcode derleme ayarıyla rahatlatır:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: Siz aksini belirtmedikçe her şey MainActor üzerinde çalışır.
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: `nonisolated` asenkron fonksiyonlar, background thread'e atlamak yerine çağrıldıkları aktör üzerinde kalmaya devam eder.

Yeni Xcode 26 projelerinde her iki ayar da varsayılan olarak etkindir. Main thread dışında CPU yoğunluklu bir iş yapmanız gerektiğinde ise `@concurrent` ifadesini kullanırsınız.

<pre><code class="language-swift">// MainActor üzerinde çalışır (varsayılan)
func updateUI() async { }

// Background thread'de çalışır (özellikle belirtmeniz gerekir)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>Ofis Binası Metaforu</h4>

Uygulamanızı bir ofis binası olarak hayal edin. Her bir **izolasyon alanı**, kapısı kilitli özel bir ofistir. İçeride aynı anda yalnızca bir kişi bulunabilir ve o ofisteki belgelerle çalışabilir.

- **`MainActor`** resepsiyondur; tüm müşteri etkileşimlerinin gerçekleştiği yerdir. Sadece bir tane vardır ve kullanıcının gördüğü her şeyi o yönetir.
- **`actor`** türleri; Muhasebe, Hukuk veya İK gibi departman ofisleridir. Her biri kendi hassas belgelerini korur.
- **`nonisolated`** kodlar koridordur; herkesin içinden geçebileceği ortak bir alandır, ancak orada hiçbir özel belge bulunmaz.

Birinin ofisine öylece dalamazsınız. Kapıyı çalar (`await`) ve sizi içeri almalarını beklersiniz.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [İzolasyon Alanlarından Dışarıya Ne Geçebilir: Sendable](#sendable)

İzolasyon alanları verileri korur, ancak er ya da geç bu alanlar arasında veri aktarmanız gerekir. Bunu yaptığınızda, Swift bu işlemin güvenli olup olmadığını kontrol eder.

Şöyle düşünün: Eğer bir aktörden diğerine değiştirilebilir (mutable) bir class referansı gönderirseniz, her iki aktör de bu veriyi aynı anda değiştirebilir. Bu, tam da önlemeye çalıştığımız data race olayının kendisidir. Bu yüzden Swift'in şunu bilmesi gerekir: Bu veri güvenli bir şekilde paylaşılabilir mi?

Cevap: [`Sendable`](https://developer.apple.com/documentation/swift/sendable) protokolü. Bu protokol, compiler'a şunu söyler: 'Bu tip, izolasyon sınırlarının ötesine güvenle geçebilir.'

- **Sendable** olan tipler güvenle geçebilir (value tipleri, immutable veriler, actor'ler).
- **Non-Sendable** tipler geçemez (mutable state'i olan class'lar).

```swift
// Sendable - Bu bir değer tipidir (value type), gönderildiği her yer kopyasını alır.
struct User: Sendable {
    let id: Int
    let name: String
}

// Non-Sendable - Bu, değiştirilebilir durumu (mutable state) olan bir class'tır.
class Counter {
    var count = 0  // İki farklı yerden bunu aynı anda değiştirirsek = felaket
}
```

### Tipleri Sendable Yapmak

Swift, birçok tip için `Sendable` özelliğini otomatik olarak çıkarımlar (inference):

- **Struct ve Enumeration'ların** tüm property'leri `Sendable` ise, kendiliğinden `Sendable` kabul edilir.
- **Actor'ler** her zaman `Sendable`'dır; çünkü kendi state'lerini korurlar.
- **`@MainActor`** ile işaretlenmiş tipler `Sendable`'dır; çünkü MainActor bunlara erişimi serialize eder.


Class'lar için durum daha zordur. Bir class'ın `Sendable` protokolüne uyabilmesi için `final` olarak tanımlanması ve içerdiği tüm stored property'lerinin immutable olması gerekir:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // Immutable
    let timeout: Double   // Immutable
}
```

Eğer başka yöntemlerle (locks, atomics) thread güvenliğini bizzat sağladığınız bir class'ınız varsa, compiler'a "bana güven" demek için [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable) kullanabilirsiniz:

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable compiler'a verdiğiniz bir sözdür</h4>

Compiler bu noktada thread güvenliğini doğrulamaz. Eğer yanılıyorsanız, data race kaçınılmaz olur. Bu özelliği idareli ve çok dikkatli kullanın.
</div>

<div class="tip">
<h4>Approachable Concurrency: Daha Az Sıkıntı</h4>

[Approachable Concurrency](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html) ile Sendable hataları çok daha nadir hale gelir:

- Eğer kodunuz izolasyon sınırlarını geçmiyorsa, Sendable protokolüne ihtiyaç duymazsınız.
- Asenkron fonksiyonlar, background thread'e atlamak yerine çağrıldıkları actor üzerinde kalmaya devam eder.
- Compiler, değerlerin ne zaman güvenli bir şekilde kullanıldığını tespit etme konusunda artık daha akıllıdır.

Bu özellikleri, `SWIFT_DEFAULT_ACTOR_ISOLATION` ayarını `MainActor` yaparak ve `SWIFT_APPROACHABLE_CONCURRENCY` ayarını `YES` durumuna getirerek etkinleştirebilirsiniz. Yeni Xcode 26 projelerinde bu iki ayar da varsayılan olarak etkindir. Gerçekten paralelliğe ihtiyaç duyduğunuzda, fonksiyonları `@concurrent` ile işaretleyin; Sendable konusunu işte o zaman düşünmeye başlayın.
</div>

<div class="analogy">
<h4>Fotokopiler ve Orijinal Belgeler</h4>

Tekrar ofis binasına dönelim. Departmanlar arasında bilgi paylaşmanız gerektiğinde:

- **Fotokopiler güvenlidir** - Eğer Hukuk departmanı bir belgenin kopyasını alıp Muhasebe'ye gönderirse, her iki departmanın da kendi kopyası olur. Üzerine notlar alabilir, değiştirebilir veya istediklerini yapabilirler. Herhangi bir çakışma yaşanmaz.
- **Islak imzalı orijinal sözleşmeler yerinde kalmalıdır** - Eğer iki departman da orijinal belge üzerinde aynı anda değişiklik yapabilseydi, kaos çıkardı. Gerçek halinin kimde olduğu belirsizleşirdi.

`Sendable` tipler fotokopiler gibidir: Paylaşılmaları güvenlidir; çünkü her alan yer kendi bağımsız kopyasını alır veya veriler zaten değiştirilemezdir. `Non-Sendable` tipler ise orijinal sözleşmeler gibidir; onları elden ele dolaştırmak, birbiriyle çelişen değişikliklerin yapılmasına zemin hazırlar.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [İzolasyon Nasıl Kalıtılır?](#isolation-inheritance)

İzolasyon alanlarının verileri koruduğunu ve Sendable protokolünün bu alanlar arasında nelerin geçebileceğini kontrol ettiğini gördünüz. Peki, bir kod parçası en başta bir izolasyon alanına nasıl dahil olur?

Bir fonksiyonu çağırdığınızda veya bir closure oluşturduğunuzda izolasyon, kodunuz boyunca akar. [Approachable Concurrency](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html) ile uygulamanız MainActor üzerinde başlar ve bir şey bunu açıkça değiştirmediği sürece, bu izolasyon çağırdığınız diğer kodlara da yayılır. Bu akışı anlamak, kodun nerede çalışacağını tahmin etmenize ve compiler'ın neden bazen uyarı verdiğini anlamanıza yardımcı olur.

### Fonksiyon Çağrıları

Bir fonksiyonu çağırdığınızda, fonksiyonun izolasyon alanı onun nerede çalışacağını belirler:

```swift
@MainActor func updateUI() { }      // Her zaman MainActor üzerinde çalışır
func helper() { }                    // Çağıranın (caller) izolasyonunu devralır.
@concurrent func crunch() async { }  // Açıkça actor dışında (off-actor) çalışır.
```

[Approachable Concurrency](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html) sayesinde, kodunuzun çoğu `MainActor` izolasyonunu devralır. Bir fonksiyon, açıkça bu durumdan muaf olmayı seçmediği sürece, çağıran kişi nerede çalışıyorsa orada çalışır.

### Closure'lar

Closure'lar, tanımlandıkları ortamın izolasyonunu kalıtır:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // ViewModel'den MainActor izolasyonunu devralır
            self.updateUI()  // Burada UI'ı güvenle güncelleyebiliriz.
        }
        closure()
    }
}
```

SwiftUI'daki `Button` action closure'larının `@State` değerlerini neden güvenle güncelleyebildiğinin sebebi budur: Bu closure'lar, içinde bulundukları view'dan MainActor izolasyonunu devralırlar.

### Task'lar
"Bir `Task { }`, oluşturulduğu yerin actor izolasyonunu kalıtır:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // MainActor izolasyonunu devralır
            self.updateUI()  // Burada UI'ı güvenle güncelleyebiliriz.
        }
    }
}
```

Genellikle istediğimiz davranış da budur. Task, kendisini oluşturan kodla aynı actor üzerinde çalışır.

### Kalıtımı Bozmak: Task.detached

Bazen hiçbir bağlamı devralmayan bir task oluşturmak istersiniz:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // Actor izolasyonu yoktur, ortak havuzda (cooperative pool) çalışır.
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // UI'ı güncellemek için açıkça main thread'e geri döneriz.
            }
        }
    }
}
```

<div class="warning">
<h4>Task.detached kullanmak genellikle tavsiye edilmez</h4>

Swift geliştiricileri, [Task.detached kullanımını son çare olarak önermektedir](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). Bu yapı; task priority'lerini, task-local value'larını veya actor izolasyonunu devralmaz. Çoğu zaman ihtiyacınız olan şey standart `Task` kullanımıdır. Eğer main actor dışında CPU yoğunluklu bir iş yapmanız gerekiyorsa, ilgili fonksiyonu `@concurrent`  ile işaretlemek en doğru seçim olacaktır.
</div>

### Async Yardımcılarda İzolasyonu Korumak

Bazen closure kabul eden jenerik bir async fonksiyon yazarsınız - bir wrapper, retry helper, transaction scope. Çağıran closure'ı iletir, fonksiyonunuz onu çalıştırır. Basit, değil mi?

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

Ancak bunu bir `@MainActor` bağlamından çağırdığınızda, Swift şikayet eder:

<div class="compiler-error">
Sending value of non-Sendable type '() async throws -> T' risks causing data races
</div>

Ne oluyor? Closure'ınız MainActor'dan durum yakalar, ama `measure` `nonisolated`. Swift, Sendable olmayan bir closure'ın izolasyon sınırını geçtiğini görür - tam olarak önlemek için tasarlandığı şey.

En basit çözüm `nonisolated(nonsending)`'dir. Bu, Swift'e fonksiyonun kendisini çağıran executor üzerinde kalması gerektiğini söyler:

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

Artık fonksiyonun tamamı çağıranın executor'ında çalışır. MainActor'dan çağırın, MainActor'da kalır. Özel bir actor'dan çağırın, orada kalır. Closure asla izolasyon sınırını geçmez, bu yüzden Sendable kontrolü gerekmez.

<div class="tip">
<h4>Hangi yaklaşımı ne zaman kullanmalı</h4>

**`nonisolated(nonsending)`** - Basit seçenek. Sadece attribute'u ekleyin. Çağıranın executor'ında kalmak istediğinizde bunu kullanın.

**`isolation: isolated (any Actor)? = #isolation`** - Açık seçenek. Actor instance'ına erişim sağlayan bir parametre ekler. İzolasyon bağlamını başka fonksiyonlara aktarmanız veya hangi actor üzerinde olduğunuzu incelemeniz gerektiğinde bunu kullanın.
</div>

Eğer actor'e açık erişime ihtiyacınız varsa, bunun yerine bir [`#isolation`](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/expressions/#Isolation-Expression) parametresi kullanın:

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

Her iki yaklaşım da doğal kullanılan async araçlar oluşturmak için gereklidir. Bunlar olmadan, çağıranların closure'larını `@Sendable` yapması veya compiler'ı tatmin etmek için çemberlerden atlaması gerekirdi.

<div class="analogy">
<h4>Ofis Binasında Yürüyüşe Çıkmak</h4>

Resepsiyondasınız (MainActor) ve size yardım etmesi için birini çağırıyorsunuz; o kişi *sizin* ofisinize gelir. Sizin bulunduğunuz konumu devralır. Eğer bir task oluşturursanız ("git benim için şunu yap"), o asistan da işe yine sizin ofisinizden başlar.

Birinin başka bir ofise gitmesinin tek yolu, bunu açıkça yapmasıdır: 'Bunun için Muhasebe'de çalışmam gerekiyor' (`actor`) veya 'Ben bu işle arka ofiste ilgileneceğim' (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [Toparlayalım](#putting-it-together)

Gelin biraz arkamıza yaslanalım ve tüm parçaların birbirine nasıl oturduğuna bakalım.

Swift Concurrency; `async/await`, `Task`, actor'ler, `MainActor`, `Sendable` ve izolasyon alanları gibi çok fazla kavramdan oluşuyormuş gibi hissettirebilir. Ancak tüm bunların merkezinde tek bir fikir yatar: **İzolasyon, varsayılan olarak kalıtılır**.

[Approachable Concurrency](https://www.swift.org/documentation/articles/swift-6.2-release-notes.html) etkinken, uygulamanız [`MainActor`](https://developer.apple.com/documentation/swift/mainactor) üzerinde başlar. Başlangıç noktanız burasıdır. Buradan itibaren:

- Çağırdığınız her fonksiyon o izolasyonu **kalıtır**.
- Oluşturduğunuz her closure o izolasyonu **yakalar**.
- Başlattığınız her [`Task { }`](https://developer.apple.com/documentation/swift/task) o izolasyonu **kalıtır**.

Hiçbir şeyi annotate etmek zorunda değilsiniz. Thread'ler hakkında düşünmek zorunda değilsiniz. Kodunuz `MainActor` üzerinde çalışır ve izolasyon, programınız boyunca otomatik olarak yayılır.

Bu kalıtım zincirinden çıkmanız gerektiğinde, bunu açıkça (explicitly) yaparsınız:

- **`@concurrent`** der ki: "Bunu background thread'de çalıştır."
- **`actor`** der ki: "Bu tipin kendi özel izolasyon alanı var."
- **`Task.detached { }`** der ki: "Her şeye sıfırdan başla, hiçbir şeyi kalıtma."

Ve izolasyon alanları arasında veri aktardığınızda, Swift bunun güvenli olup olmadığını kontrol eder. [`Sendable`](https://developer.apple.com/documentation/swift/sendable) protokolü işte bunun içindir: Sınırları güvenle geçebilecek tipleri işaretlemek.

İşte bu kadar. Tüm model bundan ibaret:

1. **İzolasyon yayılır**: `MainActor`'den başlayarak kodunuz boyunca ilerler.
2. **Açıkça belirtirsiniz**: İşleri background thread'de çalıştırmaya ihtiyaç duyduğunuzda bunu açıkça belirtirsiniz.
3. **Sendable sınırları korur**: Veri izolasyon alanları arasında yer değiştirdiğinde güvenliği sağlar.


Compiler hata verdiğinde, aslında size bu kurallardan birinin ihlal edildiğini söylüyordur. Kalıtım zincirini takip edin: İzolasyon nereden geldi? Kod nerede çalışmaya çalışıyor? Hangi veri bir sınırı geçiyor? Doğru soruyu sorduğunuzda cevap genellikle barizdir.

### Bundan Sonra Nereye?

İyi haber şu: Her şeyi aynı anda ustalıkla öğrenmenize gerek yok.

**Çoğu uygulama için sadece temel bilgiler yeterlidir.** ViewModel'lerinizi `@MainActor` ile işaretleyin, ağ çağrıları için `async/await` kullanın ve bir butona dokunulduğunda asenkron bir iş başlatmak için `Task { }` oluşturun. Hepsi bu. Bu kadarı, gerçek dünyadaki uygulamaların %80'ini idare eder. Daha fazlasına ihtiyacınız olduğunda compiler sizi zaten uyaracaktır.

**Paralel çalışmaya ihtiyaç duyduğunuzda**; aynı anda birden fazla veri fetch'lemek için `async let` yapısına, eğer task sayısı dinamikse [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) yapısına başvurun. Cancellation durumlarını zarif bir şekilde yönetmeyi öğrenin. Bu bilgiler, karmaşık veri yükleme süreçleri veya gerçek zamanlı özelliklere sahip uygulamalar için yeterlidir.

**Gelişmiş desenler ise (eğer gerekirse) zamanla oturur**: Shared mutable state için özel actor'ler, CPU yoğunluklu işlemler için `@concurrent` ve derinlemesine `Sendable` bilgisi... Bunlar genellikle kütüphane/framework kodları, server-side Swift veya çok karmaşık masaüstü uygulamaları içindir. Çoğu geliştirici bu seviyeye hiçbir zaman ihtiyaç duymaz.

<div class="tip">
<h4>Basit ilerleyin</h4>

Olmayan sorunlar için optimizasyon yapmayın. Temel bilgilerle başlayın, uygulamanızı yayınlayın ve karmaşıklığı ancak gerçek sorunlarla karşılaştığınızda ekleyin. Compiler size yol gösterecektir.
</div>
  </div>
</section>

<section id="mistakes">
  <div class="container">

## [Dikkat: Yaygın Hatalar](#mistakes)

### async = background sanmak

```swift
// Bu kod HALA main thread'i kilitler!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // Senkron iş = bloklar
    data = result
}
```

`async` sadece "duraklatılabilir" anlamına gelir. Gerçek iş, tanımlandığı yer neresiyse orada çalışmaya devam eder. CPU yoğunluklu işler için `@concurrent` (Swift 6.2) veya `Task.detached` kullanın.

### Çok fazla Actor oluşturmak

```swift
// Over-engineering
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// Böylesi Daha İyi - çoğu şeyi MainActor'de halledebiliriz.
@MainActor
class AppState { }
```
Özel bir actor'e yalnızca shared mutable state'e sahip bir yapınız varsa ve bu yapı `MainActor` üzerinde bulunamayacaksa ihtiyaç duyarsınız. [Matt Massicotte'un kuralı](https://www.massicotte.org/actors/) der ki 'Yeni bir actor'ü şu koşulların üçü de geçerli olduğunda oluşturun':
- `Non-Sendable` bir state'e sahipseniz
- Bu state içerisindeki işlemlerin atomic olması gerekiyorsa 
- Bu işlemler zaten var olan bir actor üzerinde yapılamıyorsa

Eğer bu kurallar sağlanmıyorsa `@MainActor` kullanın.

### Her şeyi Sendable yapmaya çalışmak

Her şeyin izolasyon sınırlarını geçmesi gerekmez. Eğer her yere `@unchecked Sendable` ekliyorsanız, durup bir düşünün: Bu verinin gerçekten izolasyon alanları arasında taşınması gerekiyor mu?

### Gereksiz yere MainActor.run kullanmak

```swift
// Gereksiz
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// Böylesi Daha İyi - fonksiyonu @MainActor ile işaretle
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` nadiren doğru çözümdür. Eğer `MainActor` izolasyonuna ihtiyacınız varsa, fonksiyonun kendisini `@MainActor` ile işaretleyin. Bu hem daha nettir hem de compiler'a yardımcı olur. [Matt'in bu konudaki fikirlerine](https://www.massicotte.org/problematic-patterns/) bir göz atın.

### Ortak thread havuzunu kilitlemek

```swift
// Bunu ASLA yapmayın - deadlock riski var!
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // Cooperative thread'i bloklar!
}
```

Swift'in thread havuzu sınırlıdır. `DispatchSemaphore` veya `DispatchSemaphore.wait()` gibi çağrılarla bir thread'i kilitlerseniz, deadlock'lara neden olabilirsiniz. Senkron ve asenkron kodları bridge'lemeniz gerekiyorsa `async let` kullanın veya tamamen asenkron yapıya geçin.

### Gereksiz Task'lar oluşturmak

```swift
// Gereksiz
func fetchAll() async {
    Task { await fetchUsers() }
    Task { await fetchPosts() }
}

// Böylesi Daha İyi - Structured concurrency kullan
func fetchAll() async {
    async let users = fetchUsers()
    async let posts = fetchPosts()
    await (users, posts)
}
```

Eğer zaten asenkron bir bağlamdaysanız, yeni unstructured `Task`'lar oluşturmak yerine "Structured Concurrency" yapılarını (`async let`, `TaskGroup`) tercih edin. Structured Concurrency cancellation işlemlerini otomatik yönetir ve kodun takibini kolaylaştırır.

  </div>
</section>

<section id="glossary">
  <div class="container">

## [Kopya Kağıdı: Hızlı Referans](#glossary)

| Anahtar kelime | Ne İşe Yarar? |
|---------|--------------|
| `async` | Fonksiyonun duraklatılabileceğini belirtir. |
| `await` | İşlem tamamlanana kadar burada durakla. |
| `Task { }` | Asenkron iş başlatır, mevcut bağlamı kalıtır.|
| `Task.detached { }` | Asenkron iş başlatır, hiçbir bağlamı kalıtmaz. |
| `@MainActor` | Kodun main thread üzerinde çalışmasını sağlar. |
| `actor` | Kendini izole etmiş ve mutable state'e sahip tip. |
| `nonisolated` | Bir kod parçasını actor izolasyonunun dışına çıkarır. |
| `nonisolated(nonsending)` | Çağıranın executor'ında kalır. |
| `Sendable` | İzolasyon alanları arasında güvenle taşınabilen tipler. |
| `@concurrent` | Her zaman background thread'de çalıştırır (Swift 6.2+). |
| `#isolation` | Çağıranın izolasyonunu parametre olarak yakalar. |
| `async let` | Paralel iş başlatır. |
| `TaskGroup` | Dinamik sayıda paralel işi yönetmek için kullanılır. |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [Daha Fazlası İçin](#further-reading)

<div class="resources">
<h4>Matt Massicotte'un Blogu (Şiddetle Tavsiye Edilir)</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - Temel terminoloji
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - Sistemin ana mantığı
- [When should you use an actor?](https://www.massicotte.org/actors/) - Pratik rehber
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - Neden bazen daha basit yapıların daha iyi olduğu üzerine bir bakış açısı
</div>

<div class="resources">
<h4>Resmi Apple Kaynakları</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>Araçlar</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) - Büyük takımlar ve codebase'ler ile daha hızlı ürün geliştirin
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [AI Agent Yeteneği](#ai-skill)

Yapay zeka kodlama asistanınızın Swift Concurrency mantığını kavramasını mı istiyorsunuz? Bu mental modelleri; Claude Code, Codex, Amp, OpenCode ve diğer AI ajanları için paketlenmiş bir **[SKILL.md](/SKILL.md)** dosyası olarak sunuyoruz.

### Diğer yetenekler

- <a href="https://github.com/AvdLee/Swift-Concurrency-Agent-Skill" target="_blank" rel="noreferrer noopener">Antoine'ın açık kaynak Swift Concurrency Agent Skill'i</a>

<div class="tip">
<h4>Yetenek nedir?</h4>

Bir 'yetenek', yapay zeka agent'larına uzmanlık gerektiren bilgileri öğreten bir Markdown dosyasıdır. Swift Concurrency yeteneğini agent'ınıza eklediğinizde, asenkron Swift kodu yazmanıza yardımcı olurken bu kavramları otomatik olarak uygular.
</div>

### Nasıl Kullanılır?

Kullandığınız agent'ı seçin ve aşağıdaki komutları çalıştırın

<div class="code-tabs">
  <div class="code-tabs-nav">
    <button class="active">Claude Code</button>
    <button>Codex</button>
    <button>Amp</button>
    <button>OpenCode</button>
  </div>
  <div class="code-tab-content active">

```bash
# Personal skill (tüm projeleriniz için)
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Project skill (sadece bu proje için)
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Global instructions (tüm projeleriniz için)
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Project instructions (sadece bu proje için)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Project instructions (önerilen)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Global rules (tüm projeleriniz için)
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Project rules (sadece bu proje için)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

Bu yetenek dosyası; Ofis Binası metaforunu, izolasyon desenlerini, Sendable rehberliğini, yaygın hataları ve hızlı referans tablolarını içerir. Agent'ınız, Swift Concurrency kodu üzerinde çalışırken bu bilgileri otomatik olarak kullanacaktır.

  </div>
</section>
