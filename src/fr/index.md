---
layout: base.njk
title: La Putain d'Approchable Swift Concurrency
description: Un guide sans bullshit sur la concurrence en Swift. Redécouvrez async/await, les tasks, Sendable et MainActor avec des modèles mentaux clairs. Pas de jargon, juste des explications compréhensibles.
lang: fr
dir: ltr
nav:
  async-await: Async/Await
  tasks: Tasks
  execution: Isolement
  sendable: Sendable
  putting-it-together: En résumé
  mistakes: Les pièges
footer:
  madeWith: Fait avec frustration et amour. Parce que la concurrence en Swift n'a pas besoin d'être confuse.
  tradition: Dans la tradition de
  traditionAnd: et
  viewOnGitHub: Voir sur GitHub
---

<section class="hero">
  <div class="container">
    <h1>La Putain d'Approchable<br><span class="accent">Swift Concurrency</span></h1>
    <p class="subtitle">Comprenez enfin async/await, les Tasks, et pourquoi le compilateur n'arrête pas de vous hurler dessus.</p>
    <p class="credit">Un Immense merci à <a href="https://www.massicotte.org/">Matt Massicotte</a> pour avoir rendu la concurrence en Swift compréhensible. Mis en forme par <a href="https://pepicrft.me">Pedro Piñera</a>, co-fondateur de <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist</a>. Vous avez trouvé une erreur ? <a href="https://github.com/tuist/fuckingapproachableswiftconcurrency/issues/new">Ouvrez une issue</a> ou <a href="https://github.com/tuist/fuckingapproachableswiftconcurrency/pulls">envoyez une PR</a>.</p>
  </div>
</section>


<section id="async-await">
  <div class="container">

## [Le Code Asynchone : async/await](#async-await)

La plupart du temps, les apps ne font qu'attendre. Récupérer des données d'un serveur – attendre la réponse. Lire un fichier sur le disque – attendre les octets. Interroger une base de données – attendre les résultats.

Avant le système de concurrence de Swift, vous exprimiez cette attente avec des callbacks, des delegates, ou [Combine](https://developer.apple.com/documentation/combine). Ça fonctionnait, mais les callbacks imbriqués deviennent vite illisibles, et Combine a une courbe d'apprentissage raide.

`async/await` donne à Swift une nouvelle façon de gérer l'attente. Au lieu de callbacks, vous écrivez du code qui ressemble à du code séquentiel – il se met en pause, attend, puis continue. Sous le capot, le runtime de Swift gère ces pauses efficacement. Mais le fait que votre app reste vraiment réactive pendant qu'elle attend dépend de *l'endroit* où s'exécute le code, ce que nous verrons plus tard.

Une **fonction async** est une fonction qui pourrait avoir besoin de se mettre en pause. on l'annote avec `async`, et quand on l'appelle, on utilise `await` pour dire « mets-toi en pause ici jusqu'à ce que ce soit fini » :

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // Se met en pause ici
    return try JSONDecoder().decode(User.self, from: data)
}

// Le point d'appel
let user = try await fetchUser(id: 123)
// Le code ici s'exécute après que fetchUser a terminé
```

Votre code se met en pause à chaque `await` – on appelle ça une **suspension**. Quand le travail est terminé, votre code reprend exactement là où il s'était arrêté. La suspension donne à Swift l'occasion de faire autre chose pendant qu'il attend.

### Attendre *toutes* les opérations

Et si vous devez récupérer plusieurs résultats ? Vous pourriez les attendre un après l'autre :

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

Mais c'est lent – chacune attend que la précédente ait terminé. Utilisez plutôt `async let` pour les exécuter en parallèle :

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // Les trois se chargent en parallèle !
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

Chaque `async let` démarre immédiatement le travail de récupération des données. Le `await` ne fait qu'attendre les résultats.

<div class="tip">
<h4>await a besoin de async</h4>

Vous ne pouvez utiliser `await` qu'à l'intérieur d'une fonction `async`.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [Gérer les Traitements : les Tasks](#tasks)

Une **[Task](https://developer.apple.com/documentation/swift/task)** est une unité de travail asynchrone que vous pouvez gérer. Jusqu'ici nous avons écrit des fonctions asynchrones, mais une Task est ce qui les exécute réellement. C'est elle qui initie du code asynchrone depuis du code synchrone et donne le contrôle sur son exécution : attendre son résultat, l'annuler, ou la laisser tourner en arrière‑plan.

Imaginons que vous soyiez en train de construire un écran de profil. Afin de charger l'avatar lorsque la vue apparaît, servez-vous du modifier [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)) qui s'annulera automatiquement quand la vue disparaîtra :

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

Si les utilisateurs peuvent changer de profil, utilisez plutôt `.task(id:)` pour recharger la vue quand la sélection change :

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

Et quand l'utilisateur tape sur un bouton « Enregistrer », créez simplement une Task manuellement :

```swift
Button("Enregistrer") {
    Task { await saveProfile() }
}
```

### Accéder aux résultats d'une Task

Quand vous créez une Task, vous obtenez une référence (handle). Utilisez alors `.value` pour attendre et récupérer le résultat :

```swift
let handle = Task {
    return await fetchUserData()
}
let userData = await handle.value  // Se met en pause jusqu'à ce que la tâche se termine
```

C'est utile quand vous avez besoin du résultat plus tard, ou quand vous voulez conserver le handle de la tâche et faire le `await` ailleurs.

Et si vous devez charger l'avatar, la bio et les stats en même temps ? choisissez un [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) pour les charger en parallèle :

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

Les Tasks à l'intérieur d'un groupe sont des **tasks enfants**, liées au parent. Il y a quelques trucs à savoir :

- **L'annulation se propage** : annulez le parent, et tous les enfants sont annulés aussi
- **Erreurs** : une erreur émise par une Task annule les Tasks sœurs et est propagée par le parent, mais seulement quand les résultats sont consommés avec `next()`, `waitForAll()` ou par une itération
- **Ordre de complétion** : les résultats arrivent selon l'ordre de fin des tasks, pas l'ordre dans lequel ils ont été ajoutés
- **Tous pour Un** : le groupe ne se termine pas tant que chaque enfant n'a pas terminé ou été annulé

C'est la **[concurrence structurée](https://developer.apple.com/videos/play/wwdc2021/10134/)** : du travail organisé en un arbre facile à comprendre et à nettoyer.

  </div>
</section>

<section id="execution">
  <div class="container">

## [La où le Code s'exécute : des Threads aux Domaines d'Isolement](#execution)

Jusqu'ici nous avons parlé de *quand* le code s'exécute (async/await) et de *comment l'organiser* (Tasks). Voyons maintenant : **où s'exécute-t-il, et comment reste-t-il sûr ?**

<div class="tip">
<h4>La plupart des apps ne font qu'attendre</h4>

La majorité du code des apps est **limité par l'I/O**. On récupère des données sur un réseau, on *await* une réponse, on la décode puis on l'affiche. S'il y a plusieurs opérations d'I/O à coordonner, on recourt aux *tasks* et aux *task groups*. La charge réelle du CPU pour ces tâches est minimale. Le thread principal peut gérer ça sans problème parce que `await` suspend sans bloquer.

Mais tôt ou tard, vous aurez des **traitements gourmands en ressource CPU** : parser un énorme fichier JSON, traiter des images, faire des calculs lourds. Ce travail n'attend rien d'externe. Il a juste besoin de cycles CPU. Si vous l'exécutez sur le thread principal, votre UI se figera. C'est à ce moment que la question « où est-ce que s'exécute le code ? » commence vraiment à compter.
</div>

### L'Ancien Monde : Beaucoup d'Options pour peu de Sécurité

Avant le système de concurrence de Swift, vous aviez plusieurs façons de gérer l'exécution :

| Approche | Ce que ça fait | Compromis |
|---------|----------|-------------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | Contrôle direct des threads | Bas niveau, sujet aux erreurs, rarement nécessaire |
| [GCD](https://developer.apple.com/documentation/dispatch) | Dispatch queues avec closures | Simple mais sans annulation, il est facile de provoquer une explosion de threads |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | Dépendances entre tasks, annulation, KVO | Plus de contrôle mais verbeux et lourd |
| [Combine](https://developer.apple.com/documentation/combine) | Streams réactifs | Super pour les flux d'événements, la courbe d'apprentissage raide |

Toutes ces solutions fonctionnaient, mais la sécurité reposait entièrement sur le développeur. Le compilateur ne pouvait pas nous aider si on oubliait de dispatcher sur main, ou si deux queues accédaient aux mêmes données en même temps.

### Le Problème : Les Data Races

Une [data race](https://developer.apple.com/documentation/xcode/data-races) se produit quand deux threads accèdent à la même mémoire en même temps, et qu'au moins un des deux la modifie :

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// Comportement indéfini : crash, corruption mémoire, ou valeur incorrecte
```

Les data races sont un comportement indéfini. Elles peuvent faire crasher l'app, corrompre la mémoire, ou produire silencieusement de mauvais résultats. L'application peut très bien fonctionner en test puis crasher aléatoirement en production. Les outils traditionnels comme les locks et sémaphores peuvent nous aider ici, mais restent manuels eux aussi et sujets aux erreurs.

<div class="warning">
<h4>La concurrence amplifie le problème</h4>

Plus l'application est concurrente, plus les data races deviennent probables. Une app iOS simple peut s'en sortir avec une sécurité multithread approximative. Un serveur web qui gère des milliers de requêtes simultanées va lui crasher en permanence. C'est pourquoi la sécurité au moment de la compilation de Swift est encore plus importante dans les environnements très concurrents.
</div>

### Changement de paradigme : des Threads vers l'Isolement

Le modèle de concurrence de Swift pose une question différente. Au lieu de « sur quel thread ça devrait s'exécuter ? », il demande : **« qui a le droit d'accéder à ces données ? »**

C'est ça, [l'isolement](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation). Plutôt que de répartir manuellement des tâches sur des threads, vous définissez des frontières autour des données. Le compilateur appliquera ces frontières au moment de la compilation, pas à l'exécution.

<div class="tip">
<h4>Sous le capot</h4>

Swift Concurrency est construit sur [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (le même runtime que GCD). La différence, c'est la couche compile‑time : les actors et l'isolement sont imposés par le compilateur, tandis que le runtime gère la planification sur un [pool de threads coopératif](https://developer.apple.com/videos/play/wwdc2021/10254/) limité au nombre de cœurs du CPU.
</div>

### Les Trois Domaines d'Isolement

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) est un [actor global](https://developer.apple.com/documentation/swift/globalactor) qui représente le domaine d'isolement du thread principal. Il est spécial parce que les frameworks d'UI (UIKit, AppKit, SwiftUI) exigent un accès sur le thread principal.

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // Protégé par l'isolement de MainActor
}
```

Quand quelque chose est annoté avec `@MainActor`, on ne dit pas « envoie ça sur le thread principal » mais plutôt « ceci appartient au domaine d'isolement de MainActor ». Le compilateur s'assurera donc que tout ce qui y accède est déjà sur MainActor ou doit faire `await` pour franchir la frontière.

<div class="tip">
<h4>En cas de doute, utilisez @MainActor</h4>

Pour la plupart des apps, annoter les ViewModels avec `@MainActor` est le bon choix. Les problématiques de performance sont souvent exagérées. Commencez comme ça et n'optimisez que lorsque vous mesurez de vrais problèmes.
</div>

**2. Actors**

Un [actor](https://developer.apple.com/documentation/swift/actor) protège son propre état mutable. Il garantit qu'un seul morceau de code peut accéder à ses données à la fois :

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // Sûr : l'actor garantit un accès exclusif
    }
}

// De l'extérieur, il faut utiliser await pour franchir la frontière
await account.deposit(100)
```

**Les actors ne sont pas des threads.** Un actor est une frontière d'isolement. C'est le runtime Swift qui décide sur quel thread s'exécute réellement le code de l'actor. Vous ne contrôlez pas ça, et vous n'avez pas besoin de le faire.

**3. Nonisolated**

Le code annoté avec [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) sort de l'isolement de l'actor. Il peut être appelé depuis n'importe où sans `await`, mais, en échange, ne peut pas accéder à l'état protégé de l'actor :

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // N'accède pas à l'état de l'actor, peut donc être appelé de n'importe où de manière sécurisée
    }
}

let name = account.bankName()  // await n'est pas nécessaire
```

<div class="tip">
<h4>Approachable Concurrency : comment diminuer la friction</h4>

[Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) simplifie le modèle mental avec deux réglages dans Xcode :

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor` : tout s'exécute sur MainActor à moins que ne le spécifiez explicitement
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES` : les fonctions asynchrones `nonisolated` restent sur l'actor de l'appelant au lieu de passer sur un thread d'arrière-plan

Les nouveaux projets Xcode 26 ont ces deux options d'activées par défaut. Si vous avez besoin de traitements gourmands en ressource CPU, utilisez `@concurrent`.

<pre><code class="language-swift">// S'exécute sur MainActor (par défaut)
func updateUI() async { }
// S'exécute sur un thread d'arrière-plan (opt‑in)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>L'Immeuble de Bureaux</h4>

Imaginez votre app comme un immeuble de bureaux. Chaque **domaine d'isolement** est un bureau privé avec une porte qui ferme à clé. Une seule personne peut être dedans à la fois, en train de travailler sur les documents du bureau.

- **`MainActor`** est la réception – c'est ici qu'ont lieu toutes les interactions avec les clients. Il n'y a qu'une réception, et elle gère tout ce que l'utilisateur voit.
- Les types **`actor`** sont les bureaux des départements – Comptabilité, Juridique, RH. Chacun protège ses propres documents sensibles.
- Le code **`nonisolated`** est le couloir – un espace partagé où tout le monde peut circuler, mais où aucun document privé n'y réside.

Vous ne pouvez pas simplement défoncer la porte du bureau de quelqu'un. Vous devez frapper (`await`) et vous attendez qu'on vous ouvre.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [Voyager entre les Domaines d'Isolement : Sendable](#sendable)

Les domaines d'isolement protègent les données, mais on a parfois besoin de passer des données entre eux. Quand on le fait, Swift vérifie que l'échange est sûr.

Réfléchissez‑y : si vous passez une référence vers une classe mutable d'un actor à un autre, les deux actors pourraient la modifier simultanément. C'est exactement le type de data race qu'on essaie d'éviter. Swift doit donc savoir : est‑ce que ces données peuvent être partagées en toute sécurité ?

La réponse est le protocole [`Sendable`](https://developer.apple.com/documentation/swift/sendable). C'est un marqueur qui dit au compilateur « ce type est sûr, il peut franchir la  frontière de l'isolement » :

- Les types **Sendable** peuvent passer en toute sécurité (types valeur, données immuables, actors)
- Les types **Non‑Sendable** ne le peuvent pas (classes avec état mutable)

```swift
// Sendable – c'est un type valeur, chaque endroit en obtient une copie
struct User: Sendable {
    let id: Int
    let name: String
}

// Non‑Sendable – c'est une classe avec état mutable
class Counter {
    var count = 0  // Si c'est modifier à deux endroits = catastrophe
}
```

### Rendre les Types Sendable

Swift infère automatiquement `Sendable` pour beaucoup de types :

- Les **structs et enums** dont toutes les propriétés sont `Sendable` sont implicitement `Sendable`
- Les **actors** sont toujours `Sendable` parce qu'ils protègent leur propre état
- Les **types `@MainActor`** sont `Sendable` parce que MainActor sérialise l'accès

Pour les classes, c'est plus difficile. Une classe ne peut conformer à `Sendable` que si elle est `final` et que toutes ses propriétés stockées sont immuables :

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // Immuable
    let timeout: Double   // Immuable
}
```

Si vous avez une classe qui est thread‑safe par d'autres moyens (locks, atomiques), vous pouvez utiliser [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable) pour dire au compilateur « fais‑moi confiance, je gère » :

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable est une promesse</h4>

Le compilateur ne vérifiera pas la thread‑safety. Si vous vous trompez, vous aurez des data races. Utilisez‑le avec prudence et parcimonie.
</div>

<div class="tip">
<h4>Approachable Concurrency : moins de friction</h4>

Avec [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), les erreurs liées à Sendable deviennent beaucoup plus rares :

- Si le code ne franchit pas de frontières d'isolement, Sendable n'est pas nécessaire
- Les fonctions asynchrones restent sur l'actor de l'appelant au lieu de sauter sur un thread d'arrière-plan
- Le compilateur détecte plus intelligemment si les valeurs sont utilisées de façon sûre

Activez l'Approchoable Concurrency en réglant `SWIFT_DEFAULT_ACTOR_ISOLATION` sur `MainActor` et `SWIFT_APPROACHABLE_CONCURRENCY` sur `YES`. Les nouveaux projets Xcode 26 ont ces deux options activées par défaut. Quand vous avez besoin de parallélisme, marquez vos fonctions `@concurrent` et *ensuite* réfléchissez à Sendable.
</div>

<div class="analogy">
<h4>Photocopies vs. Originaux</h4>

Revenons à l'analogie de l'immeuble de bureaux. Lorsque vous devez partager des informations entre départements :

- **Les photocopies sont sûres** – Si le service juridique fait une copie d'un document et l'envoie à la compta, les deux ont leur propre copie. Ils peuvent écrire dessus, les modifier, peu importe. Il n'y a pas de conflit.
- **Les contrats originaux signés doivent rester où ils sont** – Si deux départements pouvaient modifier l'original, ce serait le chaos. On ne saurait pas qui a la vraie version.

Les types `Sendable` sont comme des photocopies : sûrs à partager parce que chaque endroit obtient sa propre copie indépendante (types valeur) ou parce qu'ils sont immuables (personne ne peut les modifier). Les types non‑`Sendable` sont comme des originaux : les faire circuler crée un risque de modifications conflictuelles.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [Comment l'Isolement se Propage](#isolation-inheritance)

On a vu que les domaines d'isolement protègent les données, et que Sendable sécurise ce qui transite entre eux. Mais comment le code se retrouve dans un domaine d'isolement au départ ?

Quand vous appelez une fonction ou que vous créez une closure, l'isolement se propage dans votre code. Avec [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), votre app commence sur [`MainActor`](https://developer.apple.com/documentation/swift/mainactor), et cet isolement se propage au code que vous appelez, sauf si quelque chose le change explicitement. Comprendre ce flux vous aide à prédire où le code s'exécutera et pourquoi le compilateur se plaint parfois.

### Appels de Fonctions

Quand on appelle une fonction, son isolement détermine où elle s'exécute :

```swift
@MainActor func updateUI() { }      // S'exécute toujours sur MainActor
func helper() { }                    // Hérite de l'isolement de l'appelant
@concurrent func crunch() async { }  // S'exécute explicitement hors de l'actor
```

Avec [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), la plupart du code hérite de l'isolement de `MainActor`. La fonction s'exécute là où l'appelant s'exécute, sauf si elle en sort explicitement.

### Closures

Les closures héritent de l'isolement du contexte où elles sont définies :

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // Hérite de MainActor depuis le ViewModel
            self.updateUI()  // Sûr, même isolement
        }
        closure()
    }
}
```

C'est pour cela que les closures d'action de `Button` en SwiftUI peuvent mettre à jour un `@State` en toute sécurité : elles héritent de l'isolement MainActor de la vue.

### Tasks

Un e`Task { }` hérite de l'isolement de l'actor depuis lequel il est créé :

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // Hérite de l'isolement MainActor
            self.updateUI()  // L'appel est sûr, await n'est pas nécessaire
        }
    }
}
```

C'est généralement ce dont vous avez besoin. La task s'exécute sur le même actor que le code qui l'a créée.

### Casser l'Héritage : Task.detached

Parfois vous avez besoin d'une task qui n'hérite d'aucun contexte :

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // Pas d'isolement d'actor, s'exécute dans le pool coopératif
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // on retourne explicitement sur MainActor
            }
        }
    }

    nonisolated func expensiveCalculation() async -> Data {
        // Travail intensif en CPU
    }
}
```

<div class="warning">
<h4>Task et Task.detached sont un antipattern</h4>

Les tasks que vous programmez avec `Task { ... }` ne sont pas managées. Il n'y a aucun moyen de les annuler ou de savoir si et quand elles se terminent. Il est Impossible d'accéder à leur valeur de retour ou de savoir si elles ont rencontré une erreur. Dans la plupart des cas, il sera préférable d'utiliser des tasks gérées par un `.task` ou `TaskGroup`, [comme expliqué dans la section « Erreurs courantes »](#managedtasks).

[Task.detached devrait être votre dernier recours](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). Les tasks détachées n'héritent ni de priorité, ni de valeurs task‑local, ou de contexte d'actor. Si des traitements gourmands en ressource CPU hors de MainActor sont nécessaires, annotez plutôt la fonction avec `@concurrent` à la place.
</div>

### Préserver l'Isolement dans les fonctions Asynchrones

Parfois vous avez besoin d'écrire une fonction asynchrone générique acceptant une closure – un wrapper, un helper de retry, un scope de transaction. L'appelant passe une closure et votre fonction l'exécute. Simple, non ?

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

Mais quand on appelle ce genre de fonction depuis un contexte `@MainActor`, Swift se plaint :

<div class="compiler-error">
Sending value of non-Sendable type '() async throws -> T' risks causing data races
</div>

Que se passe‑t‑il ? Votre closure capture de l'état de MainActor, mais `measure` est `nonisolated`. Swift voit une closure non Sendable qui franchit une frontière de l'isolement – exactement ce qu'il est censé empêcher.

La solution la plus simple est `nonisolated(nonsending)`. Ça dit à Swift que la fonction doit rester sur l'executor de l'appelant :

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

Maintenant, toute la fonction s'exécute sur l'executor de l'appelant. Appellez‑la depuis MainActor, elle reste sur MainActor. Appelle‑la depuis un actor personnalisé, elle reste sur celui-ci. La closure ne franchit jamais de frontière d'isolement, donc la vérification Sendable n'est pas nécessaire.

<div class="tip">
<h4>Quelle approche utilser à quel moment ?</h4>

**`nonisolated(nonsending)`** – L'option simple. Ajoutez juste l'attribut. Utilisez‑la lorsque vous avez juste besoin de rester sur l'executor de l'appelant.

**`isolation: isolated (any Actor)? = #isolation`** – L'option explicite. Elle ajoute un paramètre qui donne accès à l'instance de l'actor. Utilisez‑la lorsque vous devez passer le contexte d'isolement à d'autres fonctions ou pour vérifier sur quel actor vous êtes.
</div>

Si vous avez vraiment besoin d'un accès explicite à l'actor, utilisez plutôt un paramètre [`#isolation`](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/expressions/#Isolation-Expression) :

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

Les deux approches sont essentielles pour construire des fonctions utilitaires asynchrones agréables à utiliser. Sans elles, les appelants devraient rendre leurs closures `@Sendable` ou faire des acrobaties pour satisfaire le compilateur.

<div class="analogy">
<h4>Se Promener dans l'Immeuble</h4>

Quand vous êtes à la réception (MainActor) et que vous appelez quelqu'un pour vous aider, il vient dans *votre* bureau. Il hérite de votre localisation. Si vous créez une task (« va faire ça pour moi »), cette personne commence aussi dans votre bureau.

La seule façon pour que quelqu'un se retrouve dans un autre bureau, c'est qu'il y aille explicitement : « j'ai besoin de travailler en Comptabilité pour ça » (`actor`), ou « je vais m'occuper de ça dans le bureau du fond » (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [La Vue d'ensemble](#putting-it-together)

Prenons du recul et voyons comment toutes les pièces s'imbriquent.

Swift Concurrency peut sembler plein de concepts : `async/await`, `Task`, actors, `MainActor`, `Sendable`, domaines d'isolement. Mais en réalité, il n'y a qu'une seule idée au centre de tout ça : **l'isolement se propage par défaut**.

En activant [Approachable Concurrency, votre app démarre sur [`MainActor`](https://developer.apple.com/documentation/swift/mainactor). C'est votre point de départ. Ensuite, À partir de là :

- Chaque fonction que vous appelez **hérite** de cet isolement
- Chaque closure que vous créez **capture** cet isolement
- Chaque [`Task { }`](https://developer.apple.com/documentation/swift/task) que vous générez **hérite** de cet isolement

Vous n'avez rien à annoter. Vous n'avez pas à penser en threads. Votre code s'exécute sur `MainActor`, et l'isolement se propage simplement à travers votre programme automatiquement.

Lorsque vous voulez vous passer de cet héritage, vous le faites explicitement :

- **`@concurrent`** dit « exécute ça sur un thread de fond »
- **`actor`** dit « ce type a son propre domaine d'isolement »
- **`Task.detached { }`** dit « commence de zéro, n'hérite de rien »

Et lorsque vous passez des données entre domaines d'isolement, Swift vérifie que c'est sûr. C'est pour ça que [`Sendable`](https://developer.apple.com/documentation/swift/sendable) existe : marquer les types qui peuvent franchir les frontières en toute sécurité.

C'est tout. Voilà tout le modèle :

1. **L'isolement se propage** depuis `MainActor` dans le code
2. **Vous en sortez explicitement** lorsque vous avez besoin de traitement en arrière‑plan ou d'un état séparé
3. **Sendable surveille les frontières** lorsque les données change de domaines

Quand le compilateur se plaint, il vous dit qu'une de ces règles a été violée. Remontez la chaîne de l'héritage : d'où vient l'isolement ? Où ce code essaie‑t‑il de s'exécuter ? Quelles sont les données qui franchissent une frontière ? La réponse devient généralement évidente une fois que vous vous posez la bonne question.

### Et Après ?

La bonne nouvelle est que vous n'avez pas besoin de tout maîtriser d'un coup.

**La plupart des apps n'ont besoin que des bases.** Annotez vos ViewModels avec `@MainActor`, utilisez `async/await` pour les appels réseau, et créez des `Task { }` quand vous devez démarrer du travail asynchrone depuis un tap de bouton. C'est tout. Ça couvre 80 % des apps du monde réel. Le compilateur vous dira si vous avez besoin d'en faire plus.

**Quand vous avez besoin de traitements en parallèle**, utilisez `async let` pour récupérer plusieurs résultats à la fois, ou [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) quand le nombre de tasks est dynamique. Apprenez à gérer proprement l'annulation. Ça couvre les apps avec chargement de données complexe ou des fonctionnalités temps réel.

Si besoin, **Les patterns avancés viennent après**. Des actors personnalisés pour l'état mutable partagé, `@concurrent` pour des traitements gourmands en ressources CPU, une compréhension fine de `Sendable`. Tout ca relève de code de framework, de Swift côté serveur ou bien d'apps desktop complexes. La plupart des développeurs n'ont jamais besoin de ce niveau de complexité.

<div class="tip">
<h4>Commence simple</h4>

N'optimisez pas pour des problèmes que vous n'avez pas. Commencez avec les bases, livrez votre app, et ajoutez de la complexité uniquement quand vous rencontrez de vrais problèmes. Le compilateur vous guidera.
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [Erreurs Courantes : Les pièges à éviter](#mistakes)

### Imaginer que async = arrière‑plan

```swift
// Ceci bloque TOUJOURS le thread principal !
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // Travail synchrone = bloquant
    data = result
}
```

`async` veut dire « peut se mettre en pause ». Le travail réel s'exécute toujours là où il s'exécute déjà. Utilise `@concurrent` (Swift 6.2) ou `Task.detached` pour un traitement gourmand en ressource CPU.

### Créer trop d'actors

```swift
// Over-engineered
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// Mieux – la plupart des choses peuvent vivre sur MainActor
@MainActor
class AppState { }
```

Un actor personnalisé n'est nécessaire que lorsque l'on a de l'état mutable partagé qui ne peut pas résider sur `MainActor`. [La règle de Matt Massicotte](https://www.massicotte.org/actors/) : introduisez un actor seulement quand (1) vous avez de l'état non‑`Sendable`, (2) les opérations sur cet état doivent être atomiques, et (3) ces opérations ne peuvent pas s'exécuter sur un actor existant. Si vous ne pouvez le justifier avec une de ces règles, utilisez plutôt  `@MainActor`.

### Tout Rendre Sendable

Toutes les données n'ont pas besoin de franchir des frontières. Si vous vous retrouvez à mettre `@unchecked Sendable` de partout, prenez du recul et demandez-vous si les données doivent vraiment voyager entre différents domaines d'isolement.

### Utiliser MainActor.run même quand ce n'est pas nécessaire

```swift
// Inutile
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// Mieux – rends simplement la fonction @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` est rarement la bonne solution. Si vous avez besoin de l'isolement de MainActor, annotez la fonction avec `@MainActor` à la place. C'est plus clair pour l'équipe et le compilateur peut alors faire des retours plus pertinent. Voyez [l'avis de Matt à ce sujet](https://www.massicotte.org/problematic-patterns/).

### Bloquer le pool de threads coopératif

```swift
// NE JAMAIS FAIRE ÇA – risque de deadlock
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // Bloque un thread coopératif !
}
```

Le pool de threads coopératif de Swift a un nombre limité de threads. En bloquer un avec `DispatchSemaphore`, `DispatchGroup.wait()`, ou des appels similaires peut provoquer des deadlocks. Si vous devez brancher du code synchrone et asynchrone, utilisez `async let` ou restructurez-le pour qu'il reste entièrement asynchrone.

<div id="managedtasks">

### Créer des unmanaged tasks 

Les tasks que vous créez manuellement avec `Task { ... }` ou `Task.detached { ... }` ne sont pas gérées. Une fois créées, vous ne pouvez plus les contrôler. Vous ne pouvez pas les annuler si la task depuis laquelle vous les avez démarrées est annulée. Vous ne pouvez pas savoir si elles ont fini leur travail, lancé une erreur ou récupérer leur valeur de retour. Démarrer une telle task, c'est comme jeter une bouteille à la mer en espérant qu'elle livre son message à destination sans jamais la revoir.

<div class="analogy">
<h4>L'Immeuble de Bureaux</h4>

Une `Task` c'est comme confier du travail à une employée. L'employée s'occupe de la demande (y compris d'attendre d'autres bureaux) pendant que vous continuez votre travail immédiat.

Après lui avoir donné du travail, vous n'avez plus aucun moyen de communiquer avec elle. Vous ne pouvez pas lui dire d'arrêter, ni savoir si elle a terminé et quel est le résultat de ce travail.

Ce que vous voulez vraiment, c'est lui donner un talkie‑walkie pour pouvoir communiquer pendant qu'elle s'occupe de la demande. Avec le talkie‑walkie, vous pouvez lui dire d'arrêter, elle peut vous dire quand elle rencontre une erreur, ou elle peut vous reporter le résultat de la requête que vous lui avez donnée.
</div>

Au lieu de créer des tasks non gérées, utilisez la concurrence de Swift pour garder le contrôle des sous‑tasks que vous créez. Utilisez `TaskGroup` pour gérer un (groupe de) sous‑task(s). Swift fournit deux fonctions `withTaskGroup() { group in ... }` pour aider à créer des groupes de tasks.

```swift
func doWork() async {

    // cette fonction se terminera quand tous les sous‑tasks auront retourné un résultat, émis une erreur, ou été annulés
    let result = try await withThrowingTaskGroup() { group in
        group.addTask {
            try await self.performAsyncOperation1()
        }
        group.addTask {
            try await self.performAsyncOperation2()
        }
        // attends et récupère les résultats des tasks ici
    }
}

func performAsyncOperation1() async throws -> Int {
    return 1
}
func performAsyncOperation2() async throws -> Int {
    return 2
}
```

Pour récupérer les résultats des tâches enfants d'un groupe, vous pouvez utiliser une boucle for‑await‑in :

```swift
var sum = 0
for await result in group {
    sum += result
}
// sum == 3
```

Vous pouvez en apprendre plus sur [TaskGroup](https://developer.apple.com/documentation/swift/taskgroup) dans la documentation Swift.

#### Note sur les Tasks et SwiftUI

Quand vous écrivez une UI, vous voulez souvent démarrer des tasks asynchrones depuis un contexte synchrone. Par exemple, vous voulez charger une image de façon asynchrone en réponse à un tap sur un élément d'UI. Démarrer des tasks asynchrones depuis un contexte synchrone n'est pas possible en Swift. C'est pour ça que vous voyez des solutions qui utilisent `Task { ... }`, ce qui introduit des tasks non gérées.

Vous ne pouvez pas utiliser `TaskGroup` depuis un modificateur synchrone de SwiftUI parce que `withTaskGroup()` est une fonction asynchrone et il en va de même pour ses fonctions associées.

Comme solution alternative, SwiftUI offre un modificateur asynchrone pouvant initier des opérations asynchrones. Le modificateur `.task { }`, qu'on a déjà mentionné, accepte une fonction `() async -> Void`, idéale pour appeler d'autres fonctions `async`. Il est disponible sur chaque `View`. Il est déclenché avant que la vue apparaisse et les tasks qu'il crée sont gérées et liées au cycle de vie de la vue, ce qui veut dire que les tasks sont annulées quand la vue disparaît.

Revenons à l'exemple du tap‑pour‑charger‑une‑image : au lieu de créer une task non gérée pour appeler une fonction asynchrone `loadImage()` depuis une fonction synchrone `.onTap() { ... }`, vous pouvez changer la valeur d'un booléen dans le code du tap et utiliser le modificateur `task(id:)` pour charger les images de façon asynchrone quand la valeur de `id` (le booléen) change.

Voici un exemple :

```swift
struct ContentView: View {

    @State private var shouldLoadImage = false

    var body: some View {
        Button("Clique !") {
            // clanger la valeur du booléen
            shouldLoadImage = !shouldLoadImage
        }
        // la Vuew gère la sous‑tâche
        // elle démarre avant que la vue soit affichée
        // et s'arrête quand la vue est cachée
        .task(id: shouldLoadImage) {
            // quand la valeur du booléen change, SwiftUI redémarre la task
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

## [Aide‑Mémoire : Référence Rapide](#glossary)

| Mot‑clé | Ce que ça fait |
|---------------|----------|
| `async` | La fonction peut se mettre en pause |
| `await` | Se met en pause ici jusqu'à ce que ce soit terminé |
| `Task { }` | Démarre un travail async, hérite du contexte |
| `Task.detached { }` | Démarre un travail async, sans contexte hérité |
| `@MainActor` | S'exécute sur le thread principal |
| `actor` | Type avec un état mutable isolé |
| `nonisolated` | Sort de l'isolement de l'actor |
| `nonisolated(nonsending)` | Reste sur l'executor de l'appelant |
| `Sendable` | Voyage de manière fiable entre domaines d'isolement |
| `@concurrent` | S'exécute toujours en arrière‑plan (Swift 6.2+) |
| `#isolation` | Capture l'isolement de l'appelant comme paramètre |
| `async let` | Démarre du travail en parallèle |
| `TaskGroup` | Travail parallèle dynamique |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [Pour Aller Plus Loin](#further-reading)

<div class="resources">
<h4>Blog de Matt Massicotte (Fortement Recommandé)</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) – Terminologie essentielle
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) – Le concept central
- [When should you use an actor?](https://www.massicotte.org/actors/) – Conseils pratiques
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) – Pourquoi est-il mieux de rester simple ?
</div>

<div class="resources">
<h4>Ressources Officielles Apple</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>Outils</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) – Développez plus rapidement dans de grosses équipes sur des projets de grandes tailles
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [Skill pour Agents IA](#ai-skill)

Vous voulez que votre assistant de code IA comprenne Swift Concurrency ? Nous fournissons un fichier **[SKILL.md](/SKILL.md)** qui regroupe ces modèles mentaux pour des agents IA comme Claude Code, Codex, Amp, OpenCode et d'autres.

### Autres skills

- <a href="https://github.com/AvdLee/Swift-Concurrency-Agent-Skill" target="_blank" rel="noreferrer noopener">Swift Concurrency Agent Skill open source d'Antoine</a>

<div class="tip">
<h4>C'est quoi un Skill ?</h4>

Un skill est un fichier markdown qui enseigne des connaissances spécialisées aux agents de code IA. En ajoutant le skill Swift Concurrency à votre agent, il appliquera automatiquement ces concepts quand il vous aidera à écrire du code Swift asynchrone.
</div>

### Comment Faire

Choisissez votre agent et exécutez les commandes :

<div class="code-tabs">
  <div class="code-tabs-nav">
    <button class="active">Claude Code</button>
    <button>Codex</button>
    <button>Amp</button>
    <button>OpenCode</button>
  </div>
  <div class="code-tab-content active">

```bash
# Skill personnel (pour tous vos projets)
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Skill de projet (seulement pour le projet courant)
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Instructions globales (pour tous vos projets)
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Instructions de projet (seulement pour le projet courant)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Instructions de projet (recommandé)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Règles globales (pour tous vos projets)
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Règles de projet (seulement pour le projet courant)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

Le skill inclut l'analogie de l'Immeuble de Bureaux, les patterns d'isolement, le guide pour Sendable, les erreurs courantes et les tableaux de référence rapide. Votre agent utilisera automatiquement ces connaissances quand vous travaillerez avec du code Swift Concurrency.

  </div>
</section>
