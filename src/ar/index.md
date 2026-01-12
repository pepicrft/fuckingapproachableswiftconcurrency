---
layout: base.njk
title: دليل سهل جداً لتزامن Swift
description: دليل صادق لتزامن Swift. تعلم async/await والـ actors وSendable وMainActor بنماذج ذهنية بسيطة. بدون مصطلحات، فقط شروحات واضحة.
lang: ar
dir: rtl
nav:
  async-await: Async/Await
  tasks: المهام
  execution: العزل
  sendable: Sendable
  putting-it-together: الملخص
  mistakes: الأخطاء الشائعة
footer:
  madeWith: صُنع بالإحباط والحب. لأن تزامن Swift لا يجب أن يكون مربكاً.
  tradition: في تقليد
  traditionAnd: و
  viewOnGitHub: عرض على GitHub
---

<section class="hero">
  <div class="container">
    <h1>دليل سهل جداً<br><span class="accent">لتزامن Swift</span></h1>
    <p class="subtitle">افهم أخيراً async/await والمهام ولماذا المترجم يصرخ عليك.</p>
    <p class="credit">شكر كبير لـ <a href="https://www.massicotte.org/">Matt Massicotte</a> لجعل تزامن Swift مفهوماً. من إعداد <a href="https://pepicrft.me">Pedro Piñera</a>، مؤسس مشارك لـ <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist</a>. وجدت مشكلة؟ <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/issues/new">افتح issue</a> أو <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/pulls">أرسل PR</a>.</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [الكود غير المتزامن: async/await](#async-await)

معظم ما تفعله التطبيقات هو الانتظار. جلب البيانات من خادم - انتظر الرد. قراءة ملف من القرص - انتظر البايتات. استعلام قاعدة بيانات - انتظر النتائج.

قبل نظام التزامن في Swift، كنت تعبر عن هذا الانتظار باستخدام callbacks أو delegates أو [Combine](https://developer.apple.com/documentation/combine). كلها تعمل، لكن الـ callbacks المتداخلة تصبح صعبة المتابعة، وCombine له منحنى تعليمي حاد.

`async/await` يعطي Swift طريقة جديدة للتعامل مع الانتظار. بدلاً من الـ callbacks، تكتب كوداً يبدو متسلسلاً - يتوقف مؤقتاً، ينتظر، ويستأنف. خلف الكواليس، يدير runtime الـ Swift هذه التوقفات بكفاءة. لكن جعل تطبيقك يبقى متجاوباً أثناء الانتظار يعتمد على *أين* يعمل الكود، وهو ما سنغطيه لاحقاً.

**الدالة غير المتزامنة** هي دالة قد تحتاج إلى التوقف مؤقتاً. تضع علامة `async` عليها، وعندما تستدعيها، تستخدم `await` لتقول "توقف هنا حتى ينتهي هذا":

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // يتعلق هنا
    return try JSONDecoder().decode(User.self, from: data)
}

// استدعاؤها
let user = try await fetchUser(id: 123)
// الكود هنا يعمل بعد اكتمال fetchUser
```

كودك يتوقف مؤقتاً عند كل `await` - هذا يسمى **التعليق**. عندما ينتهي العمل، يستأنف كودك من حيث توقف. التعليق يعطي Swift الفرصة للقيام بعمل آخر أثناء الانتظار.

### الانتظار لـ *عدة أشياء*

ماذا لو احتجت جلب عدة أشياء؟ يمكنك انتظارها واحدة تلو الأخرى:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

لكن هذا بطيء - كل واحدة تنتظر السابقة لتنتهي. استخدم `async let` لتشغيلها بالتوازي:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // الثلاثة جميعاً يجلبون بالتوازي!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

كل `async let` يبدأ فوراً. الـ `await` يجمع النتائج.

<div class="tip">
<h4>await تحتاج async</h4>

يمكنك استخدام `await` فقط داخل دالة `async`.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [إدارة العمل: المهام](#tasks)

**[المهمة](https://developer.apple.com/documentation/swift/task)** هي وحدة عمل غير متزامن يمكنك إدارتها. كتبت دوال async، لكن المهمة هي ما يشغلها فعلاً. إنها كيف تبدأ كوداً async من كود متزامن، وتعطيك التحكم في ذلك العمل: انتظر نتيجته، ألغه، أو اتركه يعمل في الخلفية.

لنقل أنك تبني شاشة ملف شخصي. حمّل الصورة عندما تظهر الواجهة باستخدام معدّل [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:))، الذي يُلغى تلقائياً عندما تختفي الواجهة:

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task { avatar = await downloadAvatar() }
    }
}
```

إذا كان المستخدمون يمكنهم التبديل بين الملفات الشخصية، استخدم `.task(id:)` لإعادة التحميل عندما يتغير الاختيار:

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

عندما ينقر المستخدم على "حفظ"، أنشئ مهمة يدوياً:

```swift
Button("Save") {
    Task { await saveProfile() }
}
```

### الوصول لنتائج المهام

عندما تنشئ Task، تحصل على مقبض. استخدم `.value` للانتظار واسترجاع النتيجة:

```swift
let handle = Task {
    return await fetchUserData()
}
let userData = await handle.value  // يتوقف حتى تكتمل المهمة
```

هذا مفيد عندما تحتاج النتيجة لاحقاً، أو عندما تريد تخزين مقبض المهمة وانتظاره في مكان آخر.

ماذا لو احتجت تحميل الصورة والسيرة والإحصائيات كلها مرة واحدة؟ استخدم [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) لجلبها بالتوازي:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

المهام داخل المجموعة هي **مهام فرعية**، مرتبطة بالأب. بعض الأشياء لتعرفها:

- **الإلغاء ينتشر**: ألغِ الأب، وجميع الأبناء يُلغون أيضاً
- **الأخطاء**: خطأ مُلقى يلغي الأشقاء ويُعاد إلقاؤه، لكن فقط عندما تستهلك النتائج بـ `next()` أو `waitForAll()` أو التكرار
- **ترتيب الاكتمال**: النتائج تصل عندما تنتهي المهام، ليس بالترتيب الذي أضفتها به
- **ينتظر الجميع**: المجموعة لا ترجع حتى يكتمل كل طفل أو يُلغى

هذا هو **[التزامن المنظم](https://developer.apple.com/videos/play/wwdc2021/10134/)**: عمل منظم في شجرة سهلة الفهم والتنظيف.

  </div>
</section>

<section id="execution">
  <div class="container">

## [أين تعمل الأشياء: من الخيوط إلى نطاقات العزل](#execution)

حتى الآن تحدثنا عن *متى* يعمل الكود (async/await) و*كيف ننظمه* (المهام). الآن: **أين يعمل، وكيف نبقيه آمناً؟**

<div class="tip">
<h4>معظم التطبيقات فقط تنتظر</h4>

معظم كود التطبيقات **مرتبط بالإدخال/الإخراج**. تجلب بيانات من شبكة، *تنتظر* رداً، تفك تشفيرها، وتعرضها. إذا كان لديك عدة عمليات I/O للتنسيق، تلجأ إلى *المهام* و*مجموعات المهام*. العمل الفعلي على المعالج ضئيل. الخيط الرئيسي يمكنه التعامل مع هذا لأن `await` يعلق بدون حجب.

لكن عاجلاً أو آجلاً، سيكون لديك **عمل مرتبط بالمعالج**: تحليل ملف JSON ضخم، معالجة صور، تشغيل حسابات معقدة. هذا العمل لا ينتظر أي شيء خارجي. يحتاج فقط دورات معالج. إذا شغلته على الخيط الرئيسي، واجهتك تتجمد. هنا يصبح "أين يعمل الكود" مهماً فعلاً.
</div>

### العالم القديم: خيارات كثيرة، بدون أمان

قبل نظام التزامن في Swift، كان لديك عدة طرق لإدارة التنفيذ:

| الطريقة | ما تفعله | المقايضات |
|----------|--------------|-----------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | تحكم مباشر بالخيط | منخفض المستوى، عرضة للأخطاء، نادراً ما تحتاجه |
| [GCD](https://developer.apple.com/documentation/dispatch) | طوابير إرسال مع closures | بسيط لكن بدون إلغاء، سهل التسبب في انفجار الخيوط |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | تبعيات المهام، إلغاء، KVO | تحكم أكثر لكن مطول وثقيل |
| [Combine](https://developer.apple.com/documentation/combine) | تدفقات تفاعلية | ممتاز لتدفقات الأحداث، منحنى تعليمي حاد |

كل هذه عملت، لكن الأمان كان عليك بالكامل. المترجم لم يستطع المساعدة إذا نسيت الإرسال إلى main، أو إذا طابوران وصلا لنفس البيانات في وقت واحد.

### المشكلة: سباقات البيانات

[سباق البيانات](https://developer.apple.com/documentation/xcode/data-races) يحدث عندما يصل خيطان لنفس الذاكرة في نفس الوقت، وواحد منهم على الأقل يكتب:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// سلوك غير محدد: تعطل، فساد ذاكرة، أو قيمة خاطئة
```

سباقات البيانات هي سلوك غير محدد. يمكنها التعطل، إفساد الذاكرة، أو إنتاج نتائج خاطئة بصمت. تطبيقك يعمل جيداً في الاختبار، ثم يتعطل عشوائياً في الإنتاج. الأدوات التقليدية مثل الأقفال والـ semaphores تساعد، لكنها يدوية وعرضة للأخطاء.

<div class="warning">
<h4>التزامن يضخم المشكلة</h4>

كلما كان تطبيقك أكثر تزامناً، كلما أصبحت سباقات البيانات أكثر احتمالاً. تطبيق iOS بسيط قد يفلت مع أمان خيوط متساهل. خادم ويب يتعامل مع آلاف الطلبات المتزامنة سيتعطل باستمرار. هذا لماذا أمان Swift في وقت الترجمة يهم أكثر في البيئات عالية التزامن.
</div>

### التحول: من الخيوط إلى العزل

نموذج التزامن في Swift يسأل سؤالاً مختلفاً. بدلاً من "على أي خيط يجب أن يعمل هذا؟"، يسأل: **"من المسموح له بالوصول لهذه البيانات؟"**

هذا هو [العزل](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation). بدلاً من إرسال العمل يدوياً للخيوط، تعلن حدوداً حول البيانات. المترجم يفرض هذه الحدود في وقت البناء، ليس وقت التشغيل.

<div class="tip">
<h4>خلف الكواليس</h4>

التزامن في Swift مبني فوق [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (نفس runtime مثل GCD). الفرق هو طبقة وقت الترجمة: الـ actors والعزل يُفرضان من المترجم، بينما الـ runtime يتعامل مع الجدولة على [تجمع خيوط تعاوني](https://developer.apple.com/videos/play/wwdc2021/10254/) محدود بعدد أنوية معالجك.
</div>

### نطاقات العزل الثلاثة

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) هو [actor عالمي](https://developer.apple.com/documentation/swift/globalactor) يمثل نطاق عزل الخيط الرئيسي. إنه خاص لأن أطر واجهة المستخدم (UIKit، AppKit، SwiftUI) تتطلب الوصول للخيط الرئيسي.

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // محمي بعزل MainActor
}
```

عندما تضع علامة `@MainActor` على شيء، أنت لا تقول "أرسل هذا للخيط الرئيسي." أنت تقول "هذا ينتمي لنطاق عزل الـ main actor." المترجم يفرض أن أي شيء يصل إليه يجب أن يكون على MainActor أو يستخدم `await` لعبور الحدود.

<div class="tip">
<h4>عند الشك، استخدم @MainActor</h4>

لمعظم التطبيقات، وضع علامة @MainActor على ViewModels هو الاختيار الصحيح. المخاوف من الأداء عادة مبالغ فيها. ابدأ هنا، حسّن فقط إذا قست مشاكل فعلية.
</div>

**2. Actors**

[الـ actor](https://developer.apple.com/documentation/swift/actor) يحمي حالته القابلة للتغيير. يضمن أن قطعة واحدة فقط من الكود يمكنها الوصول لبياناته في وقت واحد:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // آمن: الـ actor يضمن الوصول الحصري
    }
}

// من الخارج، يجب أن تنتظر لعبور الحدود
await account.deposit(100)
```

**الـ Actors ليست خيوطاً.** الـ actor هو حدود عزل. runtime الـ Swift يقرر أي خيط ينفذ كود الـ actor فعلاً. أنت لا تتحكم بذلك، ولا تحتاج لذلك.

**3. Nonisolated**

الكود الموسوم بـ [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) يخرج من عزل الـ actor. يمكن استدعاؤه من أي مكان بدون `await`، لكنه لا يستطيع الوصول لحالة الـ actor المحمية:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // لا وصول لحالة الـ actor، آمن للاستدعاء من أي مكان
    }
}

let name = account.bankName()  // لا حاجة لـ await
```

<div class="tip">
<h4>Approachable Concurrency: احتكاك أقل</h4>

[Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) يبسط النموذج الذهني من خلال إعدادين في Xcode:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: كل شيء يعمل على MainActor إلا إذا قلت غير ذلك
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: دوال `nonisolated` غير المتزامنة تبقى على actor المستدعي بدلاً من القفز لخيط خلفي

مشاريع Xcode 26 الجديدة تفعّل كليهما افتراضياً. عندما تحتاج عملاً مكثفاً على المعالج بعيداً عن الخيط الرئيسي، استخدم `@concurrent`.

<pre><code class="language-swift">// يعمل على MainActor (الافتراضي)
func updateUI() async { }

// يعمل على خيط خلفي (اختياري)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>مبنى المكاتب</h4>

فكر في تطبيقك كمبنى مكاتب. كل **نطاق عزل** هو مكتب خاص بقفل على الباب. شخص واحد فقط يمكنه أن يكون بالداخل في وقت واحد، يعمل مع المستندات في ذلك المكتب.

- **`MainActor`** هو مكتب الاستقبال - حيث تحدث جميع تفاعلات العملاء. يوجد واحد فقط، ويتعامل مع كل ما يراه المستخدم.
- أنواع **`actor`** هي مكاتب الأقسام - المحاسبة، القانونية، الموارد البشرية. كل يحمي مستنداته الحساسة الخاصة.
- الكود **`nonisolated`** هو الممر - مساحة مشتركة يمكن لأي شخص المشي فيها، لكن لا توجد مستندات خاصة هناك.

لا يمكنك فقط الاقتحام لمكتب شخص آخر. تطرق (`await`) وتنتظر حتى يسمحوا لك بالدخول.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [ما الذي يمكنه عبور نطاقات العزل: Sendable](#sendable)

نطاقات العزل تحمي البيانات، لكن في النهاية تحتاج لتمرير البيانات بينها. عندما تفعل، Swift يتحقق إذا كان ذلك آمناً.

فكر في الأمر: إذا مررت مرجعاً لفئة قابلة للتغيير من actor لآخر، كلا الـ actors يمكنهما تعديلها في نفس الوقت. هذا بالضبط سباق البيانات الذي نحاول منعه. لذا Swift يحتاج أن يعرف: هل هذه البيانات يمكن مشاركتها بأمان؟

الجواب هو بروتوكول [`Sendable`](https://developer.apple.com/documentation/swift/sendable). إنه علامة تخبر المترجم "هذا النوع آمن للتمرير عبر حدود العزل":

- أنواع **Sendable** يمكنها العبور بأمان (أنواع القيمة، البيانات غير القابلة للتغيير، الـ actors)
- أنواع **Non-Sendable** لا يمكنها (الفئات ذات الحالة القابلة للتغيير)

```swift
// Sendable - إنه نوع قيمة، كل مكان يحصل على نسخة
struct User: Sendable {
    let id: Int
    let name: String
}

// Non-Sendable - إنها فئة ذات حالة قابلة للتغيير
class Counter {
    var count = 0  // مكانان يعدلان هذا = كارثة
}
```

### جعل الأنواع Sendable

Swift يستنتج تلقائياً `Sendable` للعديد من الأنواع:

- **Structs و enums** مع خصائص `Sendable` فقط هي ضمنياً `Sendable`
- **الـ Actors** دائماً `Sendable` لأنها تحمي حالتها الخاصة
- أنواع **`@MainActor`** هي `Sendable` لأن MainActor يسلسل الوصول

للفئات، الأمر أصعب. فئة يمكنها المطابقة لـ `Sendable` فقط إذا كانت `final` وجميع خصائصها المخزنة غير قابلة للتغيير:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // غير قابل للتغيير
    let timeout: Double   // غير قابل للتغيير
}
```

إذا كان لديك فئة آمنة للخيوط بوسائل أخرى (أقفال، atomics)، يمكنك استخدام [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable) لتخبر المترجم "ثق بي":

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>‎@unchecked Sendable هو وعد</h4>

المترجم لن يتحقق من أمان الخيوط. إذا كنت مخطئاً، ستحصل على سباقات بيانات. استخدمه بحذر.
</div>

<div class="tip">
<h4>Approachable Concurrency: احتكاك أقل</h4>

مع [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)، أخطاء Sendable تصبح أندر بكثير:

- إذا كان الكود لا يعبر حدود العزل، لا تحتاج Sendable
- الدوال غير المتزامنة تبقى على actor المستدعي بدلاً من القفز لخيط خلفي
- المترجم أذكى في اكتشاف متى تُستخدم القيم بأمان

فعّله بتعيين `SWIFT_DEFAULT_ACTOR_ISOLATION` إلى `MainActor` و`SWIFT_APPROACHABLE_CONCURRENCY` إلى `YES`. مشاريع Xcode 26 الجديدة تفعّل كليهما افتراضياً. عندما تحتاج التوازي، ضع علامة `@concurrent` على الدوال وعندها فكر في Sendable.
</div>

<div class="analogy">
<h4>النسخ مقابل المستندات الأصلية</h4>

عودة لمبنى المكاتب. عندما تحتاج مشاركة معلومات بين الأقسام:

- **النسخ آمنة** - إذا صنع القانونية نسخة من مستند وأرسلها للمحاسبة، كلاهما لديه نسخته الخاصة. يمكنهم الكتابة عليها، تعديلها، ما شاءوا. لا تضارب.
- **العقود الأصلية الموقعة يجب أن تبقى مكانها** - إذا كان بإمكان قسمين كليهما تعديل الأصل، تحدث الفوضى. من لديه النسخة الحقيقية؟

أنواع `Sendable` مثل النسخ: آمنة للمشاركة لأن كل مكان يحصل على نسخته المستقلة (أنواع القيمة) أو لأنها غير قابلة للتغيير (لا أحد يستطيع تعديلها). أنواع Non-`Sendable` مثل العقود الأصلية: تمريرها يخلق إمكانية تعديلات متضاربة.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [كيف يُورَث العزل](#isolation-inheritance)

رأيت أن نطاقات العزل تحمي البيانات، وSendable يتحكم فيما يعبر بينها. لكن كيف ينتهي الكود في نطاق عزل في الأصل؟

عندما تستدعي دالة أو تنشئ closure، العزل يتدفق عبر كودك. مع [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)، تطبيقك يبدأ على [`MainActor`](https://developer.apple.com/documentation/swift/mainactor)، وذلك العزل ينتشر للكود الذي تستدعيه، إلا إذا غيّره شيء صراحةً. فهم هذا التدفق يساعدك على التنبؤ أين يعمل الكود ولماذا المترجم أحياناً يشتكي.

### استدعاءات الدوال

عندما تستدعي دالة، عزلها يحدد أين تعمل:

```swift
@MainActor func updateUI() { }      // دائماً تعمل على MainActor
func helper() { }                    // ترث عزل المستدعي
@concurrent func crunch() async { }  // صراحةً تعمل بعيداً عن الـ actor
```

مع [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency)، معظم كودك يرث عزل `MainActor`. الدالة تعمل حيث يعمل المستدعي، إلا إذا خرجت صراحةً.

### الـ Closures

الـ Closures ترث العزل من السياق الذي عُرّفت فيه:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // ترث MainActor من ViewModel
            self.updateUI()  // آمن، نفس العزل
        }
        closure()
    }
}
```

هذا لماذا closures الـ `Button` في SwiftUI يمكنها تحديث `@State` بأمان: ترث عزل MainActor من الواجهة.

### المهام

`Task { }` ترث عزل الـ actor من حيث أُنشئت:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // ترث عزل MainActor
            self.updateUI()  // آمن، لا حاجة لـ await
        }
    }
}
```

هذا عادةً ما تريده. المهمة تعمل على نفس الـ actor مثل الكود الذي أنشأها.

### كسر الوراثة: Task.detached

أحياناً تريد مهمة لا ترث أي سياق:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // لا عزل actor، تعمل على التجمع التعاوني
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // قفز صريح للخلف
            }
        }
    }
}
```

<div class="warning">
<h4>Task و Task.detached نمط سيء</h4>

المهام التي تجدولها بـ `Task { ... }` غير مُدارة. لا توجد طريقة لإلغائها أو معرفة متى تنتهي، إن انتهت أصلاً. لا توجد طريقة للوصول لقيمة الإرجاع أو معرفة إذا واجهت خطأ. في غالبية الحالات، سيكون من الأفضل استخدام مهام مُدارة بواسطة `.task` أو `TaskGroup`، [كما هو موضح في قسم "الأخطاء الشائعة"](#managedtasks).

[Task.detached يجب أن يكون ملاذك الأخير](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). المهام المنفصلة لا ترث الأولوية، القيم المحلية للمهمة، أو سياق الـ actor. إذا كنت تحتاج عملاً مكثفاً على المعالج بعيداً عن الـ main actor، ضع علامة `@concurrent` على الدالة بدلاً من ذلك.
</div>

### الحفاظ على العزل في أدوات async

أحياناً تكتب دالة async عامة تقبل closure - غلاف، مساعد إعادة المحاولة، نطاق معاملة. المستدعي يمرر closure، ودالتك تنفذها. بسيط، أليس كذلك؟

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

لكن عندما تستدعي هذا من سياق `@MainActor`، Swift يشتكي:

<div class="compiler-error">
Sending value of non-Sendable type '() async throws -> T' risks causing data races
</div>

ماذا يحدث؟ الـ closure الخاص بك يلتقط حالة من MainActor، لكن `measure` هي `nonisolated`. Swift يرى closure غير Sendable يعبر حدود العزل - بالضبط ما صُمم لمنعه.

الحل الأبسط هو `nonisolated(nonsending)`. هذا يخبر Swift أن الدالة يجب أن تبقى على أي منفذ استدعاها:

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

الآن الدالة بأكملها تعمل على منفذ المستدعي. استدعها من MainActor، تبقى على MainActor. استدعها من actor مخصص، تبقى هناك. الـ closure لا يعبر حدود العزل أبداً، لذا لا حاجة لفحص Sendable.

<div class="tip">
<h4>متى تستخدم كل نهج</h4>

**`nonisolated(nonsending)`** - الخيار البسيط. فقط أضف السمة. استخدمه عندما تحتاج فقط البقاء على منفذ المستدعي.

**`isolation: isolated (any Actor)? = #isolation`** - الخيار الصريح. يضيف معاملاً يعطيك الوصول لمثيل الـ actor. استخدمه عندما تحتاج تمرير سياق العزل لدوال أخرى أو فحص أي actor أنت عليه.
</div>

إذا كنت تحتاج وصولاً صريحاً للـ actor، استخدم معامل [`#isolation`](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/expressions/#Isolation-Expression) بدلاً من ذلك:

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

كلا النهجين ضروريان لبناء أدوات async تبدو طبيعية عند الاستخدام. بدونهما، سيحتاج المستدعون لجعل closures الخاصة بهم `@Sendable` أو القفز عبر حلقات لإرضاء المترجم.

<div class="analogy">
<h4>المشي عبر المبنى</h4>

عندما تكون في مكتب الاستقبال (MainActor)، وتستدعي شخصاً ليساعدك، يأتي إلى *مكتبك*. يرث موقعك. إذا أنشأت مهمة ("اذهب افعل هذا لي")، ذلك المساعد يبدأ في مكتبك أيضاً.

الطريقة الوحيدة لينتهي شخص في مكتب مختلف هي إذا ذهب صراحةً هناك: "أحتاج العمل في المحاسبة لهذا" (`actor`)، أو "سأتعامل مع هذا في المكتب الخلفي" (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [جمع كل شيء معاً](#putting-it-together)

لنتراجع ونرى كيف تتناسب جميع القطع.

التزامن في Swift قد يشعر بالكثير من المفاهيم: `async/await`، `Task`، الـ actors، `MainActor`، `Sendable`، نطاقات العزل. لكن هناك فكرة واحدة فقط في المركز: **العزل يُورَث افتراضياً**.

مع [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) مفعّل، تطبيقك يبدأ على [`MainActor`](https://developer.apple.com/documentation/swift/mainactor). هذه نقطة بدايتك. من هناك:

- كل دالة تستدعيها **ترث** ذلك العزل
- كل closure تنشئها **تلتقط** ذلك العزل
- كل [`Task { }`](https://developer.apple.com/documentation/swift/task) تطلقها **ترث** ذلك العزل

لا تحتاج لوضع تعليقات توضيحية على أي شيء. لا تحتاج للتفكير في الخيوط. كودك يعمل على `MainActor`، والعزل ينتشر عبر برنامجك تلقائياً.

عندما تحتاج للخروج من تلك الوراثة، تفعل ذلك صراحةً:

- **`@concurrent`** تقول "شغّل هذا على خيط خلفي"
- **`actor`** يقول "هذا النوع له نطاق عزل خاص به"
- **`Task.detached { }`** يقول "ابدأ من جديد، لا ترث شيئاً"

وعندما تمرر بيانات بين نطاقات العزل، Swift يتحقق أنها آمنة. هذا ما [`Sendable`](https://developer.apple.com/documentation/swift/sendable) لأجله: وضع علامة على الأنواع التي يمكنها العبور بأمان عبر الحدود.

هذا كل شيء. هذا النموذج بالكامل:

1. **العزل ينتشر** من `MainActor` عبر كودك
2. **تخرج صراحةً** عندما تحتاج عمل خلفي أو حالة منفصلة
3. **Sendable يحرس الحدود** عندما تعبر البيانات بين النطاقات

عندما يشتكي المترجم، يخبرك أن إحدى هذه القواعد انتُهكت. تتبع الوراثة: من أين جاء العزل؟ أين يحاول الكود أن يعمل؟ ما البيانات التي تعبر حدوداً؟ الجواب عادةً واضح بمجرد أن تسأل السؤال الصحيح.

### إلى أين من هنا

الأخبار الجيدة: لا تحتاج لإتقان كل شيء دفعة واحدة.

**معظم التطبيقات تحتاج فقط الأساسيات.** ضع علامة على ViewModels بـ `@MainActor`، استخدم `async/await` لاستدعاءات الشبكة، وأنشئ `Task { }` عندما تحتاج بدء عمل async من نقر زر. هذا كل شيء. هذا يتعامل مع 80% من التطبيقات الحقيقية. المترجم سيخبرك إذا احتجت المزيد.

**عندما تحتاج عملاً متوازياً**، استخدم `async let` لجلب عدة أشياء مرة واحدة، أو [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) عندما يكون عدد المهام ديناميكياً. تعلم التعامل مع الإلغاء بلطف. هذا يغطي التطبيقات ذات تحميل البيانات المعقد أو الميزات في الوقت الفعلي.

**الأنماط المتقدمة تأتي لاحقاً**، إذا أبداً. actors مخصصة للحالة القابلة للتغيير المشتركة، `@concurrent` للمعالجة المكثفة على المعالج، فهم عميق لـ Sendable. هذا كود الأطر، Swift من جانب الخادم، تطبيقات سطح المكتب المعقدة. معظم المطورين لا يحتاجون هذا المستوى أبداً.

<div class="tip">
<h4>ابدأ بسيطاً</h4>

لا تحسّن لمشاكل ليست لديك. ابدأ بالأساسيات، أطلق تطبيقك، وأضف التعقيد فقط عندما تواجه مشاكل حقيقية. المترجم سيرشدك.
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [احذر: الأخطاء الشائعة](#mistakes)

### التفكير أن async = خلفية

```swift
// هذا لا يزال يحجب الخيط الرئيسي!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // عمل متزامن = حجب
    data = result
}
```

`async` تعني "يمكن أن يتوقف مؤقتاً." العمل الفعلي لا يزال يعمل أينما يعمل. استخدم `@concurrent` (Swift 6.2) أو `Task.detached` للعمل المكثف على المعالج.

### إنشاء actors كثيرة جداً

```swift
// مفرط الهندسة
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// أفضل - معظم الأشياء يمكنها العيش على MainActor
@MainActor
class AppState { }
```

تحتاج actor مخصص فقط عندما يكون لديك حالة قابلة للتغيير مشتركة لا يمكنها العيش على `MainActor`. [قاعدة Matt Massicotte](https://www.massicotte.org/actors/): أدخل actor فقط عندما (1) لديك حالة non-`Sendable`، (2) العمليات على تلك الحالة يجب أن تكون ذرية، و(3) تلك العمليات لا يمكنها العمل على actor موجود. إذا لم تستطع تبريره، استخدم `@MainActor` بدلاً من ذلك.

### جعل كل شيء Sendable

ليس كل شيء يحتاج لعبور الحدود. إذا كنت تضيف `@unchecked Sendable` في كل مكان، تراجع واسأل إذا كانت البيانات فعلاً تحتاج للانتقال بين نطاقات العزل.

### استخدام MainActor.run عندما لا تحتاجه

```swift
// غير ضروري
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// أفضل - فقط اجعل الدالة @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` نادراً ما يكون الحل الصحيح. إذا كنت تحتاج عزل MainActor، ضع تعليق `@MainActor` على الدالة بدلاً من ذلك. أوضح والمترجم يمكنه مساعدتك أكثر. شاهد [رأي Matt في هذا](https://www.massicotte.org/problematic-patterns/).

### حجب تجمع الخيوط التعاوني

```swift
// لا تفعل هذا أبداً - يخاطر بالجمود
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // يحجب خيطاً تعاونياً!
}
```

تجمع الخيوط التعاوني في Swift له خيوط محدودة. حجب واحد بـ `DispatchSemaphore` أو `DispatchGroup.wait()` أو استدعاءات مماثلة يمكن أن يسبب جموداً. إذا كنت تحتاج ربط كود متزامن وغير متزامن، استخدم `async let` أو أعد الهيكلة للبقاء غير متزامن بالكامل.

<div id="managedtasks">

### إنشاء مهام غير مُدارة

المهام التي تنشئها يدوياً بـ `Task { ... }` أو `Task.detached { ... }` غير مُدارة. بعد إنشاء مهام غير مُدارة، لا يمكنك التحكم بها. لا يمكنك إلغاؤها إذا تم إلغاء المهمة التي بدأتها منها. لا يمكنك معرفة إذا أنهت عملها، إذا ألقت خطأ، أو جمع قيمة الإرجاع. بدء مثل هذه المهمة يشبه رمي زجاجة في البحر آملاً أن توصل رسالتها لوجهتها، دون رؤية تلك الزجاجة مرة أخرى.

<div class="analogy">
<h4>مبنى المكاتب</h4>

`Task` يشبه تكليف موظف بعمل. الموظف يتعامل مع الطلب (بما في ذلك الانتظار لمكاتب أخرى) بينما تستمر في عملك الفوري.

بعد إرسال العمل للموظف، ليس لديك وسيلة للتواصل معها. لا يمكنك إخبارها بالتوقف عن العمل أو معرفة إذا انتهت وما كانت نتيجة ذلك العمل.

ما تريده فعلاً هو إعطاء الموظف جهاز اتصال لاسلكي للتواصل معها أثناء تعاملها مع الطلب. بجهاز الاتصال، يمكنك إخبارها بالتوقف، أو يمكنها إخبارك عندما تواجه خطأ، أو يمكنها الإبلاغ عن نتيجة الطلب الذي أعطيتها إياه.
</div>

بدلاً من إنشاء مهام غير مُدارة، استخدم تزامن Swift للحفاظ على التحكم في المهام الفرعية التي تنشئها. استخدم `TaskGroup` لإدارة (مجموعة من) المهام الفرعية. Swift توفر عدة دوال `withTaskGroup() { group in ... }` للمساعدة في إنشاء مجموعات المهام.

```swift
func doWork() async {

    // هذا سيرجع عندما ترجع جميع المهام الفرعية، تلقي خطأ، أو يتم إلغاؤها
    let result = try await withThrowingTaskGroup() { group in
        group.addTask {
            try await self.performAsyncOperation1()
        }
        group.addTask {
            try await self.performAsyncOperation2()
        }
        // انتظر واجمع نتائج المهام هنا
    }
}

func performAsyncOperation1() async throws -> Int {
    return 1
}
func performAsyncOperation2() async throws -> Int {
    return 2
}
```

لجمع نتائج المهام الفرعية للمجموعة، يمكنك استخدام حلقة for-await-in:

```swift
var sum = 0
for await result in group {
    sum += result
}
// sum == 3
```

يمكنك معرفة المزيد عن [TaskGroup](https://developer.apple.com/documentation/swift/taskgroup) في توثيق Swift.

#### ملاحظة حول المهام وSwiftUI.

عند كتابة واجهة مستخدم، غالباً تريد بدء مهام غير متزامنة من سياق متزامن. مثلاً، تريد تحميل صورة بشكل غير متزامن كاستجابة للمس عنصر واجهة. بدء مهام غير متزامنة من سياق متزامن غير ممكن في Swift. لهذا ترى حلولاً تتضمن `Task { ... }`، مما يُدخل مهاماً غير مُدارة.

لا يمكنك استخدام `TaskGroup` من مُعدّل SwiftUI متزامن لأن `withTaskGroup()` دالة async أيضاً وكذلك دوالها المرتبطة.

كبديل، SwiftUI يوفر مُعدّلاً غير متزامن يمكنك استخدامه لبدء عمليات غير متزامنة. المُعدّل `.task { }`، الذي ذكرناه سابقاً، يقبل دالة `() async -> Void`، مثالية لاستدعاء دوال `async` أخرى. متاح على كل `View`. يُفعّل قبل ظهور الواجهة والمهام التي ينشئها مُدارة ومرتبطة بدورة حياة الواجهة، مما يعني أن المهام تُلغى عندما تختفي الواجهة.

عودة لمثال اللمس-لتحميل-صورة: بدلاً من إنشاء مهمة غير مُدارة لاستدعاء دالة `loadImage()` غير المتزامنة من دالة `.onTap() { ... }` المتزامنة، يمكنك تبديل علَم عند لفتة اللمس واستخدام المُعدّل `task(id:)` لتحميل الصور بشكل غير متزامن عندما تتغير قيمة `id` (العلَم).

هنا مثال:

```swift
struct ContentView: View {

    @State private var shouldLoadImage = false

    var body: some View {
        Button("اضغط هنا!") {
            // بدّل العلَم
            shouldLoadImage = !shouldLoadImage
        }
        // الـ View تدير المهمة الفرعية
        // تبدأ قبل عرض الواجهة
        // وتتوقف عندما تختفي الواجهة
        .task(id: shouldLoadImage) {
            // عندما تتغير قيمة العلَم، SwiftUI يعيد تشغيل المهمة
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

## [ورقة الغش: مرجع سريع](#glossary)

| الكلمة المفتاحية | ما تفعله |
|---------|--------------|
| `async` | الدالة يمكنها التوقف مؤقتاً |
| `await` | توقف هنا حتى ينتهي |
| `Task { }` | ابدأ عملاً async، يرث السياق |
| `Task.detached { }` | ابدأ عملاً async، بدون سياق موروث |
| `@MainActor` | يعمل على الخيط الرئيسي |
| `actor` | نوع بحالة قابلة للتغيير معزولة |
| `nonisolated` | يخرج من عزل الـ actor |
| `nonisolated(nonsending)` | البقاء على منفذ المستدعي |
| `Sendable` | آمن للتمرير بين نطاقات العزل |
| `@concurrent` | دائماً يعمل في الخلفية (Swift 6.2+) |
| `#isolation` | التقاط عزل المستدعي كمعامل |
| `async let` | ابدأ عملاً متوازياً |
| `TaskGroup` | عمل متوازي ديناميكي |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [قراءة إضافية](#further-reading)

<div class="resources">
<h4>مدونة Matt Massicotte (موصى به بشدة)</h4>

- [مسرد تزامن Swift](https://www.massicotte.org/concurrency-glossary) - المصطلحات الأساسية
- [مقدمة للعزل](https://www.massicotte.org/intro-to-isolation/) - المفهوم الأساسي
- [متى يجب استخدام actor؟](https://www.massicotte.org/actors/) - إرشادات عملية
- [أنواع Non-Sendable رائعة أيضاً](https://www.massicotte.org/non-sendable/) - لماذا الأبسط أفضل
</div>

<div class="resources">
<h4>موارد Apple الرسمية</h4>

- [توثيق تزامن Swift](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: تعرف على async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: احمِ الحالة القابلة للتغيير مع actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>أدوات</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) - طوّر أسرع مع فرق ومشاريع أكبر
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [مهارة وكيل الذكاء الاصطناعي](#ai-skill)

هل تريد أن يفهم مساعد البرمجة بالذكاء الاصطناعي Swift Concurrency؟ نقدم ملف **[SKILL.md](/SKILL.md)** الذي يحزم هذه النماذج الذهنية لوكلاء الذكاء الاصطناعي مثل Claude Code و Codex و Amp و OpenCode وغيرها.

يمكنك أيضاً الاطلاع على مهارة Swift Concurrency Agent مفتوحة المصدر من Antoine على <a href="https://github.com/AvdLee/Swift-Concurrency-Agent-Skill" target="_blank" rel="noreferrer noopener">github.com/avdlee/swift-concurrency-agent-skill</a>.

<div class="tip">
<h4>ما هي المهارة؟</h4>

المهارة هي ملف markdown يعلّم وكلاء البرمجة بالذكاء الاصطناعي معرفة متخصصة. عندما تضيف مهارة Swift Concurrency إلى وكيلك، فإنه يطبق هذه المفاهيم تلقائياً عند مساعدتك في كتابة كود Swift غير متزامن.
</div>

### كيفية الاستخدام

اختر وكيلك ونفّذ الأوامر:

<div class="code-tabs">
  <div class="code-tabs-nav">
    <button class="active">Claude Code</button>
    <button>Codex</button>
    <button>Amp</button>
    <button>OpenCode</button>
  </div>
  <div class="code-tab-content active">

```bash
# مهارة شخصية (جميع مشاريعك)
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# مهارة المشروع (هذا المشروع فقط)
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# تعليمات عامة (جميع مشاريعك)
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# تعليمات المشروع (هذا المشروع فقط)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# تعليمات المشروع (موصى به)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# قواعد عامة (جميع مشاريعك)
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# قواعد المشروع (هذا المشروع فقط)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

تتضمن المهارة تشبيه مبنى المكاتب، وأنماط العزل، ودليل Sendable، والأخطاء الشائعة، وجداول المرجع السريع. سيستخدم وكيلك هذه المعرفة تلقائياً عند العمل مع كود Swift Concurrency.

  </div>
</section>
