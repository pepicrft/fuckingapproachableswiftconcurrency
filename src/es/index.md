---
layout: base.njk
title: Swift Concurrency Jodidamente Accesible
description: Una guía sin rodeos sobre la concurrencia en Swift. Aprende async/await, actors, Sendable y MainActor con modelos mentales claros. Sin jerga, solo explicaciones comprensibles.
lang: es
dir: ltr
nav:
  async-await: Async/Await
  tasks: Tasks
  execution: Aislamiento
  sendable: Sendable
  putting-it-together: Resumen
  mistakes: Trampas
footer:
  madeWith: Hecho con frustración y amor. Porque la concurrencia en Swift no tiene que ser confusa.
  tradition: En la tradición de
  traditionAnd: y
  viewOnGitHub: Ver en GitHub
---

<section class="hero">
  <div class="container">
    <h1>Jodidamente Accesible<br><span class="accent">Swift Concurrency</span></h1>
    <p class="subtitle">Por fin entiende async/await, Tasks, y por qué el compilador no para de gritarte.</p>
    <p class="credit">Enorme agradecimiento a <a href="https://www.massicotte.org/">Matt Massicotte</a> por hacer comprensible la concurrencia en Swift. Recopilado por <a href="https://pepicrft.me">Pedro Piñera</a>, co-fundador de <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist</a>. ¿Encontraste un error? <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/issues/new">Abre un issue</a> o <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/pulls">envía un PR</a>.</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [Código Async: async/await](#async-await)

La mayor parte de lo que hacen las apps es esperar. Obtener datos de un servidor - esperar la respuesta. Leer un archivo del disco - esperar los bytes. Consultar una base de datos - esperar los resultados.

Antes del sistema de concurrencia de Swift, expresabas esta espera con callbacks, delegates, o [Combine](https://developer.apple.com/documentation/combine). Funcionan, pero los callbacks anidados se vuelven difíciles de seguir, y Combine tiene una curva de aprendizaje empinada.

`async/await` le da a Swift una nueva forma de manejar la espera. En lugar de callbacks, escribes código que parece secuencial - se pausa, espera y continúa. Por debajo, el runtime de Swift gestiona estas pausas de forma eficiente. Pero hacer que tu app realmente siga respondiendo mientras espera depende de *dónde* se ejecuta el código, que cubriremos más adelante.

Una **función async** es una que podría necesitar pausarse. La marcas con `async`, y cuando la llamas, usas `await` para decir "pausa aquí hasta que termine":

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // Se suspende aquí
    return try JSONDecoder().decode(User.self, from: data)
}

// Llamándola
let user = try await fetchUser(id: 123)
// El código aquí se ejecuta después de que fetchUser complete
```

Tu código se pausa en cada `await` - esto se llama **suspensión**. Cuando el trabajo termina, tu código continúa justo donde lo dejó. La suspensión le da a Swift la oportunidad de hacer otro trabajo mientras espera.

### Esperando por *todos ellos*

¿Y si necesitas obtener varias cosas? Podrías esperarlas una por una:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

Pero eso es lento - cada una espera a que la anterior termine. Usa `async let` para ejecutarlas en paralelo:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // ¡Las tres se están obteniendo en paralelo!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

Cada `async let` comienza inmediatamente. El `await` recoge los resultados.

<div class="tip">
<h4>await necesita async</h4>

Solo puedes usar `await` dentro de una función `async`.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [Gestionando Trabajo: Tasks](#tasks)

Un **[Task](https://developer.apple.com/documentation/swift/task)** es una unidad de trabajo async que puedes gestionar. Has escrito funciones async, pero un Task es lo que realmente las ejecuta. Es cómo inicias código async desde código síncrono, y te da control sobre ese trabajo: esperar su resultado, cancelarlo, o dejarlo ejecutar en segundo plano.

Digamos que estás construyendo una pantalla de perfil. Carga el avatar cuando aparece la vista usando el modificador [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)), que se cancela automáticamente cuando la vista desaparece:

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task { avatar = await downloadAvatar() }
    }
}
```

Si los usuarios pueden cambiar entre perfiles, usa `.task(id:)` para recargar cuando cambie la selección:

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

Cuando el usuario toca "Guardar", crea un Task manualmente:

```swift
Button("Guardar") {
    Task { await saveProfile() }
}
```

### Acceder a los resultados de Task

Cuando creas un Task, obtienes un handle. Usa `.value` para esperar y obtener el resultado:

```swift
let handle = Task {
    return await fetchUserData()
}
let userData = await handle.value  // Se suspende hasta que la tarea termine
```

Esto es útil cuando necesitas el resultado más tarde, o cuando quieres guardar el handle de la tarea y hacer await en otro lugar.

¿Y si necesitas cargar el avatar, la bio y las estadísticas a la vez? Usa un [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) para obtenerlos en paralelo:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

Los Tasks dentro de un grupo son **tasks hijos**, vinculados al padre. Algunas cosas a saber:

- **La cancelación se propaga**: cancela el padre, y todos los hijos se cancelan también
- **Errores**: un error lanzado cancela a los hermanos y se relanza, pero solo cuando consumes resultados con `next()`, `waitForAll()`, o iteración
- **Orden de completado**: los resultados llegan según terminan los tasks, no en el orden en que los añadiste
- **Espera a todos**: el grupo no retorna hasta que cada hijo complete o sea cancelado

Esto es **[concurrencia estructurada](https://developer.apple.com/videos/play/wwdc2021/10134/)**: trabajo organizado en un árbol que es fácil de entender y limpiar.

  </div>
</section>

<section id="execution">
  <div class="container">

## [Dónde Se Ejecutan Las Cosas: De Hilos a Dominios de Aislamiento](#execution)

Hasta ahora hemos hablado de *cuándo* se ejecuta el código (async/await) y *cómo organizarlo* (Tasks). Ahora: **¿dónde se ejecuta, y cómo lo mantenemos seguro?**

<div class="tip">
<h4>La mayoría de las apps solo esperan</h4>

La mayor parte del código de apps está **limitado por I/O**. Obtienes datos de una red, *await* una respuesta, la decodificas y la muestras. Si tienes múltiples operaciones I/O que coordinar, recurres a *tasks* y *task groups*. El trabajo real de CPU es mínimo. El hilo principal puede manejar esto bien porque `await` suspende sin bloquear.

Pero tarde o temprano, tendrás **trabajo intensivo de CPU**: parsear un archivo JSON gigante, procesar imágenes, ejecutar cálculos complejos. Este trabajo no espera nada externo. Solo necesita ciclos de CPU. Si lo ejecutas en el hilo principal, tu UI se congela. Aquí es donde "dónde se ejecuta el código" realmente importa.
</div>

### El Viejo Mundo: Muchas Opciones, Sin Seguridad

Antes del sistema de concurrencia de Swift, tenías varias formas de gestionar la ejecución:

| Enfoque | Qué hace | Compromisos |
|---------|----------|-------------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | Control directo de hilos | Bajo nivel, propenso a errores, raramente necesario |
| [GCD](https://developer.apple.com/documentation/dispatch) | Colas de dispatch con closures | Simple pero sin cancelación, fácil causar explosión de hilos |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | Dependencias de tasks, cancelación, KVO | Más control pero verboso y pesado |
| [Combine](https://developer.apple.com/documentation/combine) | Streams reactivos | Genial para flujos de eventos, curva de aprendizaje empinada |

Todos estos funcionaban, pero la seguridad era enteramente tu responsabilidad. El compilador no podía ayudarte si olvidabas despachar a main, o si dos colas accedían a los mismos datos simultáneamente.

### El Problema: Data Races

Un [data race](https://developer.apple.com/documentation/xcode/data-races) ocurre cuando dos hilos acceden a la misma memoria al mismo tiempo, y al menos uno está escribiendo:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// Comportamiento indefinido: crash, corrupción de memoria, o valor incorrecto
```

Los data races son comportamiento indefinido. Pueden crashear, corromper memoria, o producir silenciosamente resultados incorrectos. Tu app funciona bien en testing, luego crashea aleatoriamente en producción. Las herramientas tradicionales como locks y semáforos ayudan, pero son manuales y propensas a errores.

<div class="warning">
<h4>La concurrencia amplifica el problema</h4>

Cuanto más concurrente es tu app, más probables se vuelven los data races. Una app iOS simple podría salirse con la suya con thread safety descuidado. Un servidor web manejando miles de peticiones simultáneas crasheará constantemente. Por eso la seguridad en tiempo de compilación de Swift importa más en entornos de alta concurrencia.
</div>

### El Cambio: De Hilos a Aislamiento

El modelo de concurrencia de Swift hace una pregunta diferente. En lugar de "¿en qué hilo debería ejecutarse esto?", pregunta: **"¿quién tiene permiso para acceder a estos datos?"**

Esto es [aislamiento](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation). En lugar de despachar trabajo manualmente a hilos, declaras límites alrededor de los datos. El compilador hace cumplir estos límites en tiempo de compilación, no en runtime.

<div class="tip">
<h4>Bajo el capó</h4>

Swift Concurrency está construido sobre [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (el mismo runtime que GCD). La diferencia es la capa de tiempo de compilación: los actors y el aislamiento son impuestos por el compilador, mientras que el runtime maneja la programación en un [pool de hilos cooperativo](https://developer.apple.com/videos/play/wwdc2021/10254/) limitado a la cantidad de núcleos de tu CPU.
</div>

### Los Tres Dominios de Aislamiento

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) es un [actor global](https://developer.apple.com/documentation/swift/globalactor) que representa el dominio de aislamiento del hilo principal. Es especial porque los frameworks de UI (UIKit, AppKit, SwiftUI) requieren acceso al hilo principal.

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // Protegido por aislamiento de MainActor
}
```

Cuando marcas algo con `@MainActor`, no estás diciendo "despacha esto al hilo principal". Estás diciendo "esto pertenece al dominio de aislamiento del main actor". El compilador asegura que cualquier cosa que lo acceda debe estar en MainActor o `await` para cruzar el límite.

<div class="tip">
<h4>En caso de duda, usa @MainActor</h4>

Para la mayoría de apps, marcar tus ViewModels con `@MainActor` es la elección correcta. Las preocupaciones de rendimiento suelen estar exageradas. Empieza aquí, optimiza solo si mides problemas reales.
</div>

**2. Actors**

Un [actor](https://developer.apple.com/documentation/swift/actor) protege su propio estado mutable. Garantiza que solo un trozo de código puede acceder a sus datos a la vez:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // Seguro: el actor garantiza acceso exclusivo
    }
}

// Desde fuera, debes hacer await para cruzar el límite
await account.deposit(100)
```

**Los actors no son hilos.** Un actor es un límite de aislamiento. El runtime de Swift decide qué hilo realmente ejecuta el código del actor. Tú no controlas eso, y no necesitas hacerlo.

**3. Nonisolated**

El código marcado [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) opta por salir del aislamiento del actor. Puede ser llamado desde cualquier lugar sin `await`, pero no puede acceder al estado protegido del actor:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // No accede al estado del actor, seguro llamar desde cualquier lugar
    }
}

let name = account.bankName()  // No se necesita await
```

<div class="tip">
<h4>Approachable Concurrency: Menos Fricción</h4>

[Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) simplifica el modelo mental con dos configuraciones de Xcode:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: Todo se ejecuta en MainActor a menos que digas lo contrario
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: Las funciones async `nonisolated` permanecen en el actor del llamador en lugar de saltar a un hilo de fondo

Los nuevos proyectos de Xcode 26 tienen ambos habilitados por defecto. Cuando necesites trabajo intensivo de CPU fuera del hilo principal, usa `@concurrent`.

<pre><code class="language-swift">// Se ejecuta en MainActor (el default)
func updateUI() async { }

// Se ejecuta en hilo de fondo (opt-in)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>El Edificio de Oficinas</h4>

Piensa en tu app como un edificio de oficinas. Cada **dominio de aislamiento** es una oficina privada con cerradura en la puerta. Solo una persona puede estar dentro a la vez, trabajando con los documentos de esa oficina.

- **`MainActor`** es la recepción - donde ocurren todas las interacciones con clientes. Solo hay una, y maneja todo lo que el usuario ve.
- Los tipos **`actor`** son oficinas de departamento - Contabilidad, Legal, RRHH. Cada uno protege sus propios documentos sensibles.
- El código **`nonisolated`** es el pasillo - espacio compartido por donde cualquiera puede caminar, pero ningún documento privado vive ahí.

No puedes simplemente irrumpir en la oficina de alguien. Tocas (`await`) y esperas a que te dejen entrar.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [Qué Puede Cruzar Dominios de Aislamiento: Sendable](#sendable)

Los dominios de aislamiento protegen los datos, pero eventualmente necesitas pasar datos entre ellos. Cuando lo haces, Swift verifica si es seguro.

Piénsalo: si pasas una referencia a una clase mutable de un actor a otro, ambos actores podrían modificarla simultáneamente. Eso es exactamente el data race que estamos tratando de prevenir. Así que Swift necesita saber: ¿se pueden compartir estos datos de forma segura?

La respuesta es el protocolo [`Sendable`](https://developer.apple.com/documentation/swift/sendable). Es un marcador que le dice al compilador "este tipo es seguro para pasar a través de límites de aislamiento":

- Los tipos **Sendable** pueden cruzar de forma segura (tipos de valor, datos inmutables, actors)
- Los tipos **No-Sendable** no pueden (clases con estado mutable)

```swift
// Sendable - es un tipo de valor, cada lugar obtiene una copia
struct User: Sendable {
    let id: Int
    let name: String
}

// No-Sendable - es una clase con estado mutable
class Counter {
    var count = 0  // Dos lugares modificando esto = desastre
}
```

### Haciendo Tipos Sendable

Swift infiere automáticamente `Sendable` para muchos tipos:

- **Structs y enums** con solo propiedades `Sendable` son implícitamente `Sendable`
- **Actors** siempre son `Sendable` porque protegen su propio estado
- **Tipos `@MainActor`** son `Sendable` porque MainActor serializa el acceso

Para clases, es más difícil. Una clase solo puede conformar a `Sendable` si es `final` y todas sus propiedades almacenadas son inmutables:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // Inmutable
    let timeout: Double   // Inmutable
}
```

Si tienes una clase que es thread-safe por otros medios (locks, atómicos), puedes usar [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable) para decirle al compilador "confía en mí":

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable es una promesa</h4>

El compilador no verificará la thread safety. Si te equivocas, tendrás data races. Úsalo con moderación.
</div>

<div class="tip">
<h4>Approachable Concurrency: Menos Fricción</h4>

Con [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), los errores de Sendable se vuelven mucho más raros:

- Si el código no cruza límites de aislamiento, no necesitas Sendable
- Las funciones async permanecen en el actor del llamador en lugar de saltar a un hilo de fondo
- El compilador es más inteligente detectando cuándo los valores se usan de forma segura

Habilítalo configurando `SWIFT_DEFAULT_ACTOR_ISOLATION` a `MainActor` y `SWIFT_APPROACHABLE_CONCURRENCY` a `YES`. Los nuevos proyectos de Xcode 26 tienen ambos habilitados por defecto. Cuando necesites paralelismo, marca las funciones `@concurrent` y entonces piensa en Sendable.
</div>

<div class="analogy">
<h4>Fotocopias vs. Documentos Originales</h4>

Volviendo al edificio de oficinas. Cuando necesitas compartir información entre departamentos:

- **Las fotocopias son seguras** - Si Legal hace una copia de un documento y lo envía a Contabilidad, ambos tienen su propia copia. Pueden escribir en ellos, modificarlos, lo que sea. Sin conflicto.
- **Los contratos originales firmados deben quedarse donde están** - Si dos departamentos pudieran modificar el original, el caos se desata. ¿Quién tiene la versión real?

Los tipos `Sendable` son como fotocopias: seguros de compartir porque cada lugar obtiene su propia copia independiente (tipos de valor) o porque son inmutables (nadie puede modificarlos). Los tipos no-`Sendable` son como contratos originales: pasarlos crea el potencial de modificaciones conflictivas.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [Cómo Se Hereda el Aislamiento](#isolation-inheritance)

Has visto que los dominios de aislamiento protegen los datos, y Sendable controla qué cruza entre ellos. ¿Pero cómo termina el código en un dominio de aislamiento en primer lugar?

Cuando llamas a una función o creas un closure, el aislamiento fluye a través de tu código. Con [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), tu app comienza en [`MainActor`](https://developer.apple.com/documentation/swift/mainactor), y ese aislamiento se propaga al código que llamas, a menos que algo lo cambie explícitamente. Entender este flujo te ayuda a predecir dónde se ejecuta el código y por qué el compilador a veces se queja.

### Llamadas a Funciones

Cuando llamas a una función, su aislamiento determina dónde se ejecuta:

```swift
@MainActor func updateUI() { }      // Siempre se ejecuta en MainActor
func helper() { }                    // Hereda el aislamiento del llamador
@concurrent func crunch() async { }  // Explícitamente se ejecuta fuera del actor
```

Con [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), la mayor parte de tu código hereda el aislamiento de `MainActor`. La función se ejecuta donde se ejecuta el llamador, a menos que opte explícitamente por salir.

### Closures

Los closures heredan el aislamiento del contexto donde se definen:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // Hereda MainActor del ViewModel
            self.updateUI()  // Seguro, mismo aislamiento
        }
        closure()
    }
}
```

Por eso los closures de acción de `Button` de SwiftUI pueden actualizar `@State` de forma segura: heredan el aislamiento de MainActor de la vista.

### Tasks

Un `Task { }` hereda el aislamiento del actor de donde se crea:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // Hereda el aislamiento de MainActor
            self.updateUI()  // Seguro, no se necesita await
        }
    }
}
```

Esto es usualmente lo que quieres. El task se ejecuta en el mismo actor que el código que lo creó.

### Rompiendo la Herencia: Task.detached

A veces quieres un task que no herede ningún contexto:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // Sin aislamiento de actor, se ejecuta en el pool cooperativo
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // Saltar explícitamente de vuelta
            }
        }
    }
}
```

<div class="warning">
<h4>Task y Task.detached son un antipatrón</h4>

Los tasks que programas con `Task { ... }` no son gestionados. No hay forma de cancelarlos o saber cuándo terminan, si es que terminan. No hay forma de acceder a su valor de retorno o saber si encuentran un error. En la mayoría de los casos, será mejor usar tasks gestionados por `.task` o `TaskGroup`, [como se explica en la sección "Errores comunes"](#managedtasks).

[Task.detached debería ser tu último recurso](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). Los tasks detached no heredan prioridad, valores task-local, ni contexto de actor. Si necesitas trabajo intensivo de CPU fuera del main actor, marca la función `@concurrent` en su lugar.
</div>

### Preservando el Aislamiento en Utilidades Async

A veces escribes una función async genérica que acepta un closure - un wrapper, un helper de reintentos, un scope de transacción. El llamador pasa un closure, tu función lo ejecuta. Simple, ¿verdad?

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

Pero cuando llamas esto desde un contexto `@MainActor`, Swift se queja:

<div class="compiler-error">
Sending value of non-Sendable type '() async throws -> T' risks causing data races
</div>

¿Qué está pasando? Tu closure captura estado del MainActor, pero `measure` es `nonisolated`. Swift ve un closure no Sendable cruzando un límite de aislamiento - exactamente lo que está diseñado para prevenir.

La solución más simple es `nonisolated(nonsending)`. Esto le dice a Swift que la función debe permanecer en el executor que la llamó:

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

Ahora toda la función se ejecuta en el executor del llamador. Llámala desde MainActor, permanece en MainActor. Llámala desde un actor personalizado, permanece ahí. El closure nunca cruza un límite de aislamiento, así que no se necesita verificación de Sendable.

<div class="tip">
<h4>Cuándo usar cada enfoque</h4>

**`nonisolated(nonsending)`** - La opción simple. Solo añade el atributo. Úsalo cuando solo necesitas permanecer en el executor del llamador.

**`isolation: isolated (any Actor)? = #isolation`** - La opción explícita. Añade un parámetro que te da acceso a la instancia del actor. Úsalo cuando necesites pasar el contexto de aislamiento a otras funciones o inspeccionar en qué actor estás.
</div>

Si necesitas acceso explícito al actor, usa un parámetro [`#isolation`](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/expressions/#Isolation-Expression) en su lugar:

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

Ambos enfoques son esenciales para construir utilidades async que se sientan naturales de usar. Sin ellos, los llamadores necesitarían hacer sus closures `@Sendable` o saltar obstáculos para satisfacer al compilador.

<div class="analogy">
<h4>Caminando Por el Edificio</h4>

Cuando estás en la oficina de recepción (MainActor), y llamas a alguien para que te ayude, vienen a *tu* oficina. Heredan tu ubicación. Si creas un task ("ve a hacer esto por mí"), ese asistente también empieza en tu oficina.

La única forma en que alguien termina en una oficina diferente es si va explícitamente allí: "Necesito trabajar en Contabilidad para esto" (`actor`), o "Lo manejaré en la oficina de atrás" (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [Juntándolo Todo](#putting-it-together)

Demos un paso atrás y veamos cómo encajan todas las piezas.

Swift Concurrency puede parecer muchos conceptos: `async/await`, `Task`, actors, `MainActor`, `Sendable`, dominios de aislamiento. Pero realmente hay solo una idea en el centro de todo: **el aislamiento se hereda por defecto**.

Con [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) habilitado, tu app comienza en [`MainActor`](https://developer.apple.com/documentation/swift/mainactor). Ese es tu punto de partida. Desde ahí:

- Cada función que llamas **hereda** ese aislamiento
- Cada closure que creas **captura** ese aislamiento
- Cada [`Task { }`](https://developer.apple.com/documentation/swift/task) que generas **hereda** ese aislamiento

No tienes que anotar nada. No tienes que pensar en hilos. Tu código se ejecuta en `MainActor`, y el aislamiento simplemente se propaga a través de tu programa automáticamente.

Cuando necesitas salir de esa herencia, lo haces explícitamente:

- **`@concurrent`** dice "ejecuta esto en un hilo de fondo"
- **`actor`** dice "este tipo tiene su propio dominio de aislamiento"
- **`Task.detached { }`** dice "empieza de cero, no heredes nada"

Y cuando pasas datos entre dominios de aislamiento, Swift verifica que sea seguro. Para eso es [`Sendable`](https://developer.apple.com/documentation/swift/sendable): marcar tipos que pueden cruzar límites de forma segura.

Eso es todo. Ese es todo el modelo:

1. **El aislamiento se propaga** desde `MainActor` a través de tu código
2. **Optas por salir explícitamente** cuando necesitas trabajo en segundo plano o estado separado
3. **Sendable vigila los límites** cuando los datos cruzan entre dominios

Cuando el compilador se queja, te está diciendo que una de estas reglas fue violada. Traza la herencia: ¿de dónde vino el aislamiento? ¿Dónde está tratando de ejecutarse el código? ¿Qué datos están cruzando un límite? La respuesta usualmente es obvia una vez que haces la pregunta correcta.

### A Dónde Ir Desde Aquí

La buena noticia: no necesitas dominar todo de una vez.

**La mayoría de las apps solo necesitan lo básico.** Marca tus ViewModels con `@MainActor`, usa `async/await` para llamadas de red, y crea `Task { }` cuando necesites iniciar trabajo async desde un tap de botón. Eso es todo. Eso cubre el 80% de las apps del mundo real. El compilador te dirá si necesitas más.

**Cuando necesites trabajo paralelo**, recurre a `async let` para obtener múltiples cosas a la vez, o [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) cuando el número de tasks es dinámico. Aprende a manejar la cancelación con gracia. Esto cubre apps con carga de datos compleja o funcionalidades en tiempo real.

**Los patrones avanzados vienen después**, si acaso. Actors personalizados para estado mutable compartido, `@concurrent` para procesamiento intensivo de CPU, comprensión profunda de `Sendable`. Esto es código de framework, Swift del lado del servidor, apps de escritorio complejas. La mayoría de los desarrolladores nunca necesitan este nivel.

<div class="tip">
<h4>Empieza simple</h4>

No optimices para problemas que no tienes. Empieza con lo básico, lanza tu app, y añade complejidad solo cuando encuentres problemas reales. El compilador te guiará.
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [Cuidado: Errores Comunes](#mistakes)

### Pensar que async = segundo plano

```swift
// ¡Esto TODAVÍA bloquea el hilo principal!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // Trabajo síncrono = bloqueante
    data = result
}
```

`async` significa "puede pausar". El trabajo real todavía se ejecuta donde se ejecuta. Usa `@concurrent` (Swift 6.2) o `Task.detached` para trabajo pesado de CPU.

### Crear demasiados actors

```swift
// Sobre-ingeniería
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// Mejor - la mayoría de cosas pueden vivir en MainActor
@MainActor
class AppState { }
```

Solo necesitas un actor personalizado cuando tienes estado mutable compartido que no puede vivir en `MainActor`. [La regla de Matt Massicotte](https://www.massicotte.org/actors/): introduce un actor solo cuando (1) tienes estado no-`Sendable`, (2) las operaciones sobre ese estado deben ser atómicas, y (3) esas operaciones no pueden ejecutarse en un actor existente. Si no puedes justificarlo, usa `@MainActor` en su lugar.

### Hacer todo Sendable

No todo necesita cruzar límites. Si estás añadiendo `@unchecked Sendable` en todas partes, da un paso atrás y pregunta si los datos realmente necesitan moverse entre dominios de aislamiento.

### Usar MainActor.run cuando no lo necesitas

```swift
// Innecesario
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// Mejor - simplemente haz la función @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` raramente es la solución correcta. Si necesitas aislamiento de MainActor, anota la función con `@MainActor` en su lugar. Es más claro y el compilador puede ayudarte más. Mira [la opinión de Matt sobre esto](https://www.massicotte.org/problematic-patterns/).

### Bloquear el pool de hilos cooperativo

```swift
// NUNCA hagas esto - riesgo de deadlock
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // ¡Bloquea un hilo cooperativo!
}
```

El pool de hilos cooperativo de Swift tiene hilos limitados. Bloquear uno con `DispatchSemaphore`, `DispatchGroup.wait()`, o llamadas similares puede causar deadlocks. Si necesitas conectar código sync y async, usa `async let` o reestructura para quedarte completamente async.

<div id="managedtasks">

### Crear tasks no gestionados

Los tasks que creas manualmente con `Task { ... }` o `Task.detached { ... }` no son gestionados. Después de crear tasks no gestionados, no puedes controlarlos. No puedes cancelarlos si el task desde el que los iniciaste es cancelado. No puedes saber si terminaron su trabajo, si lanzaron un error, o recoger su valor de retorno. Iniciar tal task es como tirar una botella al mar esperando que entregue su mensaje a su destino, sin volver a ver esa botella jamás.

<div class="analogy">
<h4>El Edificio de Oficinas</h4>

Un `Task` es como asignar trabajo a un empleado. El empleado maneja la solicitud (incluyendo esperar a otras oficinas) mientras continúas con tu trabajo inmediato.

Después de enviar trabajo al empleado, no tienes medios para comunicarte con ella. No puedes decirle que deje el trabajo o saber si terminó y cuál fue el resultado de ese trabajo.

Lo que realmente quieres es darle al empleado un walkie-talkie para comunicarte con ella mientras maneja la solicitud. Con el walkie-talkie, puedes decirle que pare, o ella puede decirte cuando encuentre un error, o puede reportar el resultado de la solicitud que le diste.
</div>

En lugar de crear tasks no gestionados, usa la concurrencia de Swift para mantener el control de los subtasks que creas. Usa `TaskGroup` para gestionar un (grupo de) subtask(s). Swift proporciona un par de funciones `withTaskGroup() { group in ... }` para ayudar a crear grupos de tasks.

```swift
func doWork() async {

    // esto retornará cuando todos los subtasks retornen, lancen un error, o sean cancelados
    let result = try await withThrowingTaskGroup() { group in
        group.addTask {
            try await self.performAsyncOperation1()
        }
        group.addTask {
            try await self.performAsyncOperation2()
        }
        // espera y recoge los resultados de los tasks aquí
    }
}

func performAsyncOperation1() async throws -> Int {
    return 1
}
func performAsyncOperation2() async throws -> Int {
    return 2
}
```

Para recoger los resultados de los tasks hijos del grupo, puedes usar un bucle for-await-in:

```swift
var sum = 0
for await result in group {
    sum += result
}
// sum == 3
```

Puedes aprender más sobre [TaskGroup](https://developer.apple.com/documentation/swift/taskgroup) en la documentación de Swift.

#### Nota sobre Tasks y SwiftUI.

Al escribir una UI, a menudo quieres iniciar tasks asíncronos desde un contexto síncrono. Por ejemplo, quieres cargar una imagen asíncronamente como respuesta a un toque en un elemento de UI. Iniciar tasks asíncronos desde un contexto síncrono no es posible en Swift. Por eso ves soluciones que involucran `Task { ... }`, lo cual introduce tasks no gestionados.

No puedes usar `TaskGroup` desde un modificador síncrono de SwiftUI porque `withTaskGroup()` es una función async también y lo mismo aplica para sus funciones relacionadas.

Como alternativa, SwiftUI ofrece un modificador asíncrono que puedes usar para iniciar operaciones asíncronas. El modificador `.task { }`, que ya mencionamos, acepta una función `() async -> Void`, ideal para llamar otras funciones `async`. Está disponible en cada `View`. Se activa antes de que la vista aparezca y los tasks que crea son gestionados y vinculados al ciclo de vida de la vista, lo que significa que los tasks se cancelan cuando la vista desaparece.

Volviendo al ejemplo de tocar-para-cargar-una-imagen: en lugar de crear un task no gestionado para llamar una función asíncrona `loadImage()` desde una función síncrona `.onTap() { ... }`, puedes alternar una bandera en el gesto de tap y usar el modificador `task(id:)` para cargar imágenes asíncronamente cuando el valor del `id` (la bandera) cambie.

Aquí hay un ejemplo:

```swift
struct ContentView: View {

    @State private var shouldLoadImage = false

    var body: some View {
        Button("¡Haz clic!") {
            // alterna la bandera
            shouldLoadImage = !shouldLoadImage
        }
        // la View gestiona el subtask
        // se inicia antes de que la vista se muestre
        // y se detiene cuando la vista se oculta
        .task(id: shouldLoadImage) {
            // cuando el valor de la bandera cambia, SwiftUI reinicia el task
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

## [Chuleta: Referencia Rápida](#glossary)

| Palabra clave | Qué hace |
|---------------|----------|
| `async` | La función puede pausar |
| `await` | Pausa aquí hasta que termine |
| `Task { }` | Inicia trabajo async, hereda contexto |
| `Task.detached { }` | Inicia trabajo async, sin contexto heredado |
| `@MainActor` | Se ejecuta en el hilo principal |
| `actor` | Tipo con estado mutable aislado |
| `nonisolated` | Opta por salir del aislamiento del actor |
| `nonisolated(nonsending)` | Permanece en el executor del llamador |
| `Sendable` | Seguro para pasar entre dominios de aislamiento |
| `@concurrent` | Siempre se ejecuta en segundo plano (Swift 6.2+) |
| `#isolation` | Captura el aislamiento del llamador como parámetro |
| `async let` | Inicia trabajo paralelo |
| `TaskGroup` | Trabajo paralelo dinámico |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [Lectura Adicional](#further-reading)

<div class="resources">
<h4>Blog de Matt Massicotte (Muy Recomendado)</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - Terminología esencial
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - El concepto central
- [When should you use an actor?](https://www.massicotte.org/actors/) - Guía práctica
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - Por qué lo simple es mejor
</div>

<div class="resources">
<h4>Recursos Oficiales de Apple</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>Herramientas</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) - Desarrolla más rápido con equipos y proyectos grandes
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [Skill para Agentes IA](#ai-skill)

¿Quieres que tu asistente de código IA entienda Swift Concurrency? Proporcionamos un archivo **[SKILL.md](/SKILL.md)** que empaqueta estos modelos mentales para agentes IA como Claude Code, Codex, Amp, OpenCode y otros.

<div class="tip">
<h4>¿Qué es un Skill?</h4>

Un skill es un archivo markdown que enseña conocimientos especializados a los agentes de código IA. Cuando añades el skill de Swift Concurrency a tu agente, automáticamente aplica estos conceptos cuando te ayuda a escribir código Swift asíncrono.
</div>

### Cómo Usar

Elige tu agente y ejecuta los comandos:

<div class="code-tabs">
  <div class="code-tabs-nav">
    <button class="active">Claude Code</button>
    <button>Codex</button>
    <button>Amp</button>
    <button>OpenCode</button>
  </div>
  <div class="code-tab-content active">

```bash
# Skill personal (todos tus proyectos)
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Skill de proyecto (solo este proyecto)
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Instrucciones globales (todos tus proyectos)
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Instrucciones de proyecto (solo este proyecto)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Instrucciones de proyecto (recomendado)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Reglas globales (todos tus proyectos)
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Reglas de proyecto (solo este proyecto)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

El skill incluye la analogía del Edificio de Oficinas, patrones de aislamiento, guía de Sendable, errores comunes y tablas de referencia rápida. Tu agente usará este conocimiento automáticamente cuando trabajes con código Swift Concurrency.

  </div>
</section>
