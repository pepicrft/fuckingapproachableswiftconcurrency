---
layout: base.njk
title: Swift Concurrency Pra Caralho Acessível
description: Um guia sem enrolação sobre concorrência em Swift. Aprenda async/await, actors, Sendable e MainActor com modelos mentais claros. Sem jargão, só explicações diretas.
lang: pt-BR
dir: ltr
nav:
  async-await: Async/Await
  tasks: Tasks
  execution: Isolamento
  sendable: Sendable
  putting-it-together: Resumo
  mistakes: Armadilhas
footer:
  madeWith: Feito com frustração e amor. Porque concorrência em Swift não precisa ser confusa.
  tradition: Na tradição de
  traditionAnd: e
  viewOnGitHub: Ver no GitHub
---

<section class="hero">
  <div class="container">
    <h1>Pra Caralho Acessível<br><span class="accent">Swift Concurrency</span></h1>
    <p class="subtitle">Finalmente entenda async/await, Tasks, e por que o compilador não para de reclamar com você.</p>
    <p class="credit">Enorme agradecimento a <a href="https://www.massicotte.org/">Matt Massicotte</a> por tornar a concorrência em Swift compreensível. Compilado por <a href="https://pepicrft.me">Pedro Piñera</a>, co-fundador do <a href="https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=author">Tuist</a>. Encontrou um problema? <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/issues/new">Abra uma issue</a> ou <a href="https://github.com/pepicrft/fuckingapproachableswiftconcurrency/pulls">envie um PR</a>.</p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [Código Assíncrono: async/await](#async-await)

A maior parte do que os apps fazem é esperar. Buscar dados de um servidor - esperar a resposta. Ler um arquivo do disco - esperar pelos bytes. Consultar um banco de dados - esperar pelos resultados.

Antes do sistema de concorrência do Swift, você expressava essa espera com callbacks, delegates, ou [Combine](https://developer.apple.com/documentation/combine). Eles funcionam, mas callbacks aninhados ficam difíceis de acompanhar, e o Combine tem uma curva de aprendizado íngreme.

`async/await` dá ao Swift uma nova forma de lidar com espera. Em vez de callbacks, você escreve código que parece sequencial - ele pausa, espera, e continua. Por baixo dos panos, o runtime do Swift gerencia essas pausas de forma eficiente. Mas fazer seu app realmente continuar responsivo enquanto espera depende de *onde* o código roda, o que vamos cobrir mais tarde.

Uma **função async** é uma que pode precisar pausar. Você marca com `async`, e quando você a chama, você usa `await` para dizer "pause aqui até isso terminar":

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // Suspende aqui
    return try JSONDecoder().decode(User.self, from: data)
}

// Chamando
let user = try await fetchUser(id: 123)
// Código aqui roda depois que fetchUser completa
```

Seu código pausa em cada `await` - isso é chamado de **suspensão**. Quando o trabalho termina, seu código continua exatamente de onde parou. Suspensão dá ao Swift a oportunidade de fazer outro trabalho enquanto espera.

### Esperando por *eles*

E se você precisa buscar várias coisas? Você poderia esperar uma por uma:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

Mas isso é lento - cada uma espera a anterior terminar. Use `async let` para rodá-las em paralelo:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // As três estão buscando em paralelo!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

Cada `async let` começa imediatamente. O `await` coleta os resultados.

<div class="tip">
<h4>await precisa de async</h4>

Você só pode usar `await` dentro de uma função `async`.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [Gerenciando Trabalho: Tasks](#tasks)

Uma **[Task](https://developer.apple.com/documentation/swift/task)** é uma unidade de trabalho async que você pode gerenciar. Você escreveu funções async, mas uma Task é o que realmente as executa. É como você inicia código async a partir de código síncrono, e te dá controle sobre esse trabalho: esperar pelo resultado, cancelar, ou deixar rodar em segundo plano.

Digamos que você está construindo uma tela de perfil. Carregue o avatar quando a view aparecer usando o modificador [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)), que cancela automaticamente quando a view desaparece:

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task { avatar = await downloadAvatar() }
    }
}
```

Se usuários podem alternar entre perfis, use `.task(id:)` para recarregar quando a seleção muda:

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

Quando o usuário toca "Salvar", crie uma Task manualmente:

```swift
Button("Salvar") {
    Task { await saveProfile() }
}
```

### Acessando resultados de Task

Quando você cria uma Task, recebe um handle. Use `.value` para esperar e obter o resultado:

```swift
let handle = Task {
    return await fetchUserData()
}
let userData = await handle.value  // Suspende até a task completar
```

Isso é útil quando você precisa do resultado mais tarde, ou quando quer guardar o handle da task e fazer await em outro lugar.

E se você precisa carregar o avatar, bio, e estatísticas tudo de uma vez? Use um [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) para buscá-los em paralelo:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

Tasks dentro de um grupo são **tasks filhas**, ligadas ao pai. Algumas coisas para saber:

- **Cancelamento se propaga**: cancele o pai, e todas as filhas são canceladas também
- **Erros**: um erro lançado cancela irmãs e relança, mas só quando você consome resultados com `next()`, `waitForAll()`, ou iteração
- **Ordem de conclusão**: resultados chegam conforme tasks terminam, não na ordem que você as adicionou
- **Espera por todas**: o grupo não retorna até que cada filha complete ou seja cancelada

Isso é **[concorrência estruturada](https://developer.apple.com/videos/play/wwdc2021/10134/)**: trabalho organizado em uma árvore que é fácil de entender e limpar.

  </div>
</section>

<section id="execution">
  <div class="container">

## [Onde as Coisas Rodam: De Threads a Domínios de Isolamento](#execution)

Até agora falamos sobre *quando* código roda (async/await) e *como organizá-lo* (Tasks). Agora: **onde ele roda, e como mantemos seguro?**

<div class="tip">
<h4>A maioria dos apps só espera</h4>

A maior parte do código de apps é **I/O-bound**. Você busca dados de uma rede, *await* uma resposta, decodifica, e exibe. Se você tem múltiplas operações de I/O para coordenar, você recorre a *tasks* e *task groups*. O trabalho real de CPU é mínimo. A thread principal consegue lidar bem com isso porque `await` suspende sem bloquear.

Mas cedo ou tarde, você vai ter **trabalho CPU-bound**: parsear um arquivo JSON gigante, processar imagens, rodar cálculos complexos. Esse trabalho não espera por nada externo. Só precisa de ciclos de CPU. Se você rodar na thread principal, sua UI congela. É aí que "onde o código roda" realmente importa.
</div>

### O Mundo Antigo: Muitas Opções, Nenhuma Segurança

Antes do sistema de concorrência do Swift, você tinha várias formas de gerenciar execução:

| Abordagem | O que faz | Trade-offs |
|----------|--------------|-----------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | Controle direto de thread | Baixo nível, propenso a erros, raramente necessário |
| [GCD](https://developer.apple.com/documentation/dispatch) | Dispatch queues com closures | Simples mas sem cancelamento, fácil causar explosão de threads |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | Dependências de tasks, cancelamento, KVO | Mais controle mas verboso e pesado |
| [Combine](https://developer.apple.com/documentation/combine) | Streams reativos | Ótimo para streams de eventos, curva de aprendizado íngreme |

Todos funcionavam, mas segurança era totalmente sua responsabilidade. O compilador não podia ajudar se você esquecesse de despachar para main, ou se duas queues acessassem os mesmos dados simultaneamente.

### O Problema: Data Races

Um [data race](https://developer.apple.com/documentation/xcode/data-races) acontece quando duas threads acessam a mesma memória ao mesmo tempo, e pelo menos uma está escrevendo:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// Comportamento indefinido: crash, corrupção de memória, ou valor errado
```

Data races são comportamento indefinido. Eles podem crashar, corromper memória, ou silenciosamente produzir resultados errados. Seu app funciona bem em testes, depois crasha aleatoriamente em produção. Ferramentas tradicionais como locks e semáforos ajudam, mas são manuais e propensas a erros.

<div class="warning">
<h4>Concorrência amplifica o problema</h4>

Quanto mais concorrente seu app é, mais prováveis data races se tornam. Um app iOS simples pode se safar com thread safety desleixado. Um servidor web lidando com milhares de requisições simultâneas vai crashar constantemente. É por isso que a segurança em tempo de compilação do Swift importa mais em ambientes de alta concorrência.
</div>

### A Mudança: De Threads para Isolamento

O modelo de concorrência do Swift faz uma pergunta diferente. Em vez de "em qual thread isso deveria rodar?", ele pergunta: **"quem tem permissão para acessar esses dados?"**

Isso é [isolamento](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation). Em vez de despachar trabalho manualmente para threads, você declara fronteiras ao redor dos dados. O compilador impõe essas fronteiras em tempo de build, não em runtime.

<div class="tip">
<h4>Por baixo dos panos</h4>

Swift Concurrency é construído em cima do [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (o mesmo runtime que GCD). A diferença é a camada em tempo de compilação: actors e isolamento são impostos pelo compilador, enquanto o runtime lida com agendamento em um [thread pool cooperativo](https://developer.apple.com/videos/play/wwdc2021/10254/) limitado à contagem de cores da sua CPU.
</div>

### Os Três Domínios de Isolamento

**1. MainActor**

[`@MainActor`](https://developer.apple.com/documentation/swift/mainactor) é um [global actor](https://developer.apple.com/documentation/swift/globalactor) que representa o domínio de isolamento da thread principal. É especial porque frameworks de UI (UIKit, AppKit, SwiftUI) requerem acesso à thread principal.

```swift
@MainActor
class ViewModel {
    var items: [Item] = []  // Protegido pelo isolamento do MainActor
}
```

Quando você marca algo com `@MainActor`, você não está dizendo "despache isso para a thread principal." Você está dizendo "isso pertence ao domínio de isolamento do main actor." O compilador impõe que qualquer coisa acessando deve estar no MainActor ou `await` para cruzar a fronteira.

<div class="tip">
<h4>Na dúvida, use @MainActor</h4>

Para a maioria dos apps, marcar seus ViewModels com `@MainActor` é a escolha certa. Preocupações com performance geralmente são exageradas. Comece aqui, otimize só se você medir problemas reais.
</div>

**2. Actors**

Um [actor](https://developer.apple.com/documentation/swift/actor) protege seu próprio estado mutável. Ele garante que apenas um pedaço de código pode acessar seus dados por vez:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // Seguro: actor garante acesso exclusivo
    }
}

// De fora, você deve await para cruzar a fronteira
await account.deposit(100)
```

**Actors não são threads.** Um actor é uma fronteira de isolamento. O runtime do Swift decide qual thread realmente executa código do actor. Você não controla isso, e não precisa.

**3. Nonisolated**

Código marcado como [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) opta por sair do isolamento do actor. Pode ser chamado de qualquer lugar sem `await`, mas não pode acessar o estado protegido do actor:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Acme Bank"  // Nenhum estado do actor acessado, seguro chamar de qualquer lugar
    }
}

let name = account.bankName()  // Não precisa de await
```

<div class="tip">
<h4>Approachable Concurrency: Menos Fricção</h4>

[Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) simplifica o modelo mental com duas configurações do Xcode:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: Tudo roda no MainActor a menos que você diga o contrário
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: Funções async `nonisolated` ficam no actor do chamador em vez de pular para uma thread de segundo plano

Novos projetos Xcode 26 têm ambos habilitados por padrão. Quando você precisa de trabalho intensivo de CPU fora da thread principal, use `@concurrent`.

<pre><code class="language-swift">// Roda no MainActor (o padrão)
func updateUI() async { }

// Roda em thread de segundo plano (opt-in)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>O Prédio de Escritórios</h4>

Pense no seu app como um prédio de escritórios. Cada **domínio de isolamento** é um escritório privado com uma fechadura na porta. Só uma pessoa pode estar dentro por vez, trabalhando com os documentos naquele escritório.

- **`MainActor`** é a recepção - onde todas as interações com clientes acontecem. Só existe uma, e ela lida com tudo que o usuário vê.
- Tipos **`actor`** são escritórios de departamento - Contabilidade, Jurídico, RH. Cada um protege seus próprios documentos sensíveis.
- Código **`nonisolated`** é o corredor - espaço compartilhado por onde qualquer um pode andar, mas nenhum documento privado fica lá.

Você não pode simplesmente invadir o escritório de alguém. Você bate (`await`) e espera eles te deixarem entrar.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [O Que Pode Cruzar Domínios de Isolamento: Sendable](#sendable)

Domínios de isolamento protegem dados, mas eventualmente você precisa passar dados entre eles. Quando você faz isso, Swift verifica se é seguro.

Pense nisso: se você passa uma referência para uma classe mutável de um actor para outro, ambos actors poderiam modificá-la simultaneamente. Isso é exatamente o data race que estamos tentando prevenir. Então Swift precisa saber: esses dados podem ser compartilhados com segurança?

A resposta é o protocolo [`Sendable`](https://developer.apple.com/documentation/swift/sendable). É um marcador que diz ao compilador "esse tipo é seguro para passar através de fronteiras de isolamento":

- Tipos **Sendable** podem cruzar com segurança (tipos de valor, dados imutáveis, actors)
- Tipos **Non-Sendable** não podem (classes com estado mutável)

```swift
// Sendable - é um tipo de valor, cada lugar recebe uma cópia
struct User: Sendable {
    let id: Int
    let name: String
}

// Non-Sendable - é uma classe com estado mutável
class Counter {
    var count = 0  // Dois lugares modificando isso = desastre
}
```

### Tornando Tipos Sendable

Swift automaticamente infere `Sendable` para muitos tipos:

- **Structs e enums** com apenas propriedades `Sendable` são implicitamente `Sendable`
- **Actors** são sempre `Sendable` porque protegem seu próprio estado
- **Tipos `@MainActor`** são `Sendable` porque MainActor serializa acesso

Para classes, é mais difícil. Uma classe pode conformar com `Sendable` apenas se for `final` e todas suas propriedades armazenadas forem imutáveis:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // Imutável
    let timeout: Double   // Imutável
}
```

Se você tem uma classe que é thread-safe por outros meios (locks, atomics), você pode usar [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable) para dizer ao compilador "confia em mim":

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable é uma promessa</h4>

O compilador não vai verificar thread safety. Se você estiver errado, você terá data races. Use com moderação.
</div>

<div class="tip">
<h4>Approachable Concurrency: Menos Fricção</h4>

Com [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), erros de Sendable se tornam muito mais raros:

- Se código não cruza fronteiras de isolamento, você não precisa de Sendable
- Funções async ficam no actor do chamador em vez de pular para uma thread de segundo plano
- O compilador é mais esperto em detectar quando valores são usados com segurança

Habilite configurando `SWIFT_DEFAULT_ACTOR_ISOLATION` como `MainActor` e `SWIFT_APPROACHABLE_CONCURRENCY` como `YES`. Novos projetos Xcode 26 têm ambos habilitados por padrão. Quando você precisa de paralelismo, marque funções como `@concurrent` e então pense em Sendable.
</div>

<div class="analogy">
<h4>Fotocópias vs. Documentos Originais</h4>

Voltando ao prédio de escritórios. Quando você precisa compartilhar informações entre departamentos:

- **Fotocópias são seguras** - Se o Jurídico faz uma cópia de um documento e envia para a Contabilidade, ambos têm sua própria cópia. Podem rabiscar nelas, modificar, tanto faz. Sem conflito.
- **Contratos originais assinados devem ficar parados** - Se dois departamentos pudessem modificar o original, caos se instala. Quem tem a versão real?

Tipos `Sendable` são como fotocópias: seguros para compartilhar porque cada lugar recebe sua própria cópia independente (tipos de valor) ou porque são imutáveis (ninguém pode modificá-los). Tipos non-`Sendable` são como contratos originais: passá-los por aí cria o potencial para modificações conflitantes.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [Como o Isolamento é Herdado](#isolation-inheritance)

Você viu que domínios de isolamento protegem dados, e Sendable controla o que cruza entre eles. Mas como código acaba em um domínio de isolamento em primeiro lugar?

Quando você chama uma função ou cria um closure, isolamento flui através do seu código. Com [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), seu app começa no [`MainActor`](https://developer.apple.com/documentation/swift/mainactor), e esse isolamento se propaga para o código que você chama, a menos que algo explicitamente mude isso. Entender esse fluxo te ajuda a prever onde código roda e por que o compilador às vezes reclama.

### Chamadas de Função

Quando você chama uma função, seu isolamento determina onde ela roda:

```swift
@MainActor func updateUI() { }      // Sempre roda no MainActor
func helper() { }                    // Herda isolamento do chamador
@concurrent func crunch() async { }  // Explicitamente roda fora do actor
```

Com [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), a maior parte do seu código herda isolamento do `MainActor`. A função roda onde o chamador roda, a menos que ela explicitamente opte por sair.

### Closures

Closures herdam isolamento do contexto onde são definidos:

```swift
@MainActor
class ViewModel {
    func setup() {
        let closure = {
            // Herda MainActor do ViewModel
            self.updateUI()  // Seguro, mesmo isolamento
        }
        closure()
    }
}
```

É por isso que closures de ação de `Button` do SwiftUI podem atualizar `@State` com segurança: eles herdam isolamento do MainActor da view.

### Tasks

Um `Task { }` herda isolamento do actor de onde é criado:

```swift
@MainActor
class ViewModel {
    func doWork() {
        Task {
            // Herda isolamento do MainActor
            self.updateUI()  // Seguro, não precisa de await
        }
    }
}
```

Isso geralmente é o que você quer. A task roda no mesmo actor que o código que a criou.

### Quebrando Herança: Task.detached

Às vezes você quer uma task que não herda nenhum contexto:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // Sem isolamento de actor, roda no pool cooperativo
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // Explicitamente volta
            }
        }
    }
}
```

<div class="warning">
<h4>Task e Task.detached são antipadrões</h4>

As tasks que você agenda com `Task { ... }` não são gerenciadas. Não há como cancelá-las ou saber quando terminam, se é que terminam. Não há como acessar seu valor de retorno ou saber se encontraram um erro. Na maioria dos casos, é melhor usar tasks gerenciadas por `.task` ou `TaskGroup`, [como explicado na seção "Erros Comuns"](#managedtasks).

[Task.detached deve ser seu último recurso](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). Tasks detached não herdam prioridade, valores task-local, ou contexto de actor. Se você precisa de trabalho intensivo de CPU fora do main actor, marque a função como `@concurrent` em vez disso.
</div>

### Preservando Isolamento em Utilitários Async

Às vezes você escreve uma função async genérica que aceita um closure - um wrapper, um helper de retry, um escopo de transação. O chamador passa um closure, sua função executa. Simples, certo?

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

Mas quando você chama isso de um contexto `@MainActor`, Swift reclama:

<div class="compiler-error">
Sending value of non-Sendable type '() async throws -> T' risks causing data races
</div>

O que está acontecendo? Seu closure captura estado do MainActor, mas `measure` é `nonisolated`. Swift vê um closure não Sendable cruzando uma fronteira de isolamento - exatamente o que foi projetado para prevenir.

A solução mais simples é `nonisolated(nonsending)`. Isso diz ao Swift que a função deve ficar no executor que a chamou:

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

Agora a função inteira roda no executor do chamador. Chame do MainActor, fica no MainActor. Chame de um actor customizado, fica lá. O closure nunca cruza uma fronteira de isolamento, então não precisa de verificação Sendable.

<div class="tip">
<h4>Quando usar cada abordagem</h4>

**`nonisolated(nonsending)`** - A escolha simples. Só adicione o atributo. Use quando você só precisa ficar no executor do chamador.

**`isolation: isolated (any Actor)? = #isolation`** - A escolha explícita. Adiciona um parâmetro que dá acesso à instância do actor. Use quando precisar passar o contexto de isolamento para outras funções ou inspecionar em qual actor você está.
</div>

Se você precisa de acesso explícito ao actor, use um parâmetro [`#isolation`](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/expressions/#Isolation-Expression):

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

Ambas as abordagens são essenciais para construir utilitários async que parecem naturais de usar. Sem elas, chamadores precisariam tornar seus closures `@Sendable` ou pular obstáculos para satisfazer o compilador.

<div class="analogy">
<h4>Andando Pelo Prédio</h4>

Quando você está no escritório da recepção (MainActor), e você chama alguém para te ajudar, essa pessoa vem para o *seu* escritório. Ela herda sua localização. Se você cria uma task ("vai fazer isso pra mim"), esse assistente começa no seu escritório também.

A única forma de alguém acabar em um escritório diferente é se eles explicitamente forem para lá: "Preciso trabalhar na Contabilidade pra isso" (`actor`), ou "Vou lidar com isso no escritório dos fundos" (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [Juntando Tudo](#putting-it-together)

Vamos dar um passo atrás e ver como todas as peças se encaixam.

Swift Concurrency pode parecer um monte de conceitos: `async/await`, `Task`, actors, `MainActor`, `Sendable`, domínios de isolamento. Mas existe realmente só uma ideia no centro de tudo: **isolamento é herdado por padrão**.

Com [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) habilitado, seu app começa no [`MainActor`](https://developer.apple.com/documentation/swift/mainactor). Esse é seu ponto de partida. A partir daí:

- Toda função que você chama **herda** esse isolamento
- Todo closure que você cria **captura** esse isolamento
- Toda [`Task { }`](https://developer.apple.com/documentation/swift/task) que você cria **herda** esse isolamento

Você não precisa anotar nada. Você não precisa pensar em threads. Seu código roda no `MainActor`, e o isolamento simplesmente se propaga pelo seu programa automaticamente.

Quando você precisa sair dessa herança, você faz explicitamente:

- **`@concurrent`** diz "rode isso em uma thread de segundo plano"
- **`actor`** diz "esse tipo tem seu próprio domínio de isolamento"
- **`Task.detached { }`** diz "comece do zero, não herde nada"

E quando você passa dados entre domínios de isolamento, Swift verifica se é seguro. É pra isso que [`Sendable`](https://developer.apple.com/documentation/swift/sendable) serve: marcar tipos que podem cruzar fronteiras com segurança.

É isso. Esse é o modelo todo:

1. **Isolamento se propaga** do `MainActor` através do seu código
2. **Você opta por sair explicitamente** quando precisa de trabalho em segundo plano ou estado separado
3. **Sendable guarda as fronteiras** quando dados cruzam entre domínios

Quando o compilador reclama, ele está te dizendo que uma dessas regras foi violada. Trace a herança: de onde veio o isolamento? Onde o código está tentando rodar? Que dados estão cruzando uma fronteira? A resposta geralmente é óbvia quando você faz a pergunta certa.

### Para Onde Ir Daqui

A boa notícia: você não precisa dominar tudo de uma vez.

**A maioria dos apps só precisa do básico.** Marque seus ViewModels com `@MainActor`, use `async/await` para chamadas de rede, e crie `Task { }` quando precisar iniciar trabalho async de um toque de botão. É isso. Isso cobre 80% dos apps do mundo real. O compilador vai te dizer se você precisa de mais.

**Quando você precisa de trabalho paralelo**, recorra a `async let` para buscar múltiplas coisas de uma vez, ou [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) quando o número de tasks é dinâmico. Aprenda a lidar com cancelamento graciosamente. Isso cobre apps com carregamento de dados complexo ou features em tempo real.

**Padrões avançados vêm depois**, se algum dia. Actors customizados para estado mutável compartilhado, `@concurrent` para processamento intensivo de CPU, entendimento profundo de `Sendable`. Isso é código de framework, Swift server-side, apps desktop complexos. A maioria dos desenvolvedores nunca precisa desse nível.

<div class="tip">
<h4>Comece simples</h4>

Não otimize para problemas que você não tem. Comece com o básico, lance seu app, e adicione complexidade só quando encontrar problemas reais. O compilador vai te guiar.
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [Cuidado: Erros Comuns](#mistakes)

### Pensar que async = segundo plano

```swift
// Isso AINDA bloqueia a thread principal!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // Trabalho síncrono = bloqueante
    data = result
}
```

`async` significa "pode pausar." O trabalho real ainda roda onde quer que rode. Use `@concurrent` (Swift 6.2) ou `Task.detached` para trabalho pesado de CPU.

### Criar actors demais

```swift
// Over-engineered
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// Melhor - a maioria das coisas pode viver no MainActor
@MainActor
class AppState { }
```

Você só precisa de um actor customizado quando tem estado mutável compartilhado que não pode viver no `MainActor`. [Regra do Matt Massicotte](https://www.massicotte.org/actors/): introduza um actor apenas quando (1) você tem estado non-`Sendable`, (2) operações nesse estado devem ser atômicas, e (3) essas operações não podem rodar em um actor existente. Se você não consegue justificar, use `@MainActor` em vez disso.

### Fazer tudo Sendable

Nem tudo precisa cruzar fronteiras. Se você está adicionando `@unchecked Sendable` em todo lugar, dê um passo atrás e pergunte se os dados realmente precisam se mover entre domínios de isolamento.

### Usar MainActor.run quando você não precisa

```swift
// Desnecessário
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// Melhor - apenas faça a função @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` raramente é a solução certa. Se você precisa de isolamento MainActor, anote a função com `@MainActor` em vez disso. É mais claro e o compilador pode te ajudar mais. Veja [a opinião do Matt sobre isso](https://www.massicotte.org/problematic-patterns/).

### Bloquear o thread pool cooperativo

```swift
// NUNCA faça isso - risco de deadlock
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // Bloqueia uma thread cooperativa!
}
```

O thread pool cooperativo do Swift tem threads limitadas. Bloquear uma com `DispatchSemaphore`, `DispatchGroup.wait()`, ou chamadas similares pode causar deadlocks. Se você precisa fazer ponte entre código sync e async, use `async let` ou reestruture para ficar totalmente async.

<div id="managedtasks">

### Criar tasks não gerenciadas

Tasks que você cria manualmente com `Task { ... }` ou `Task.detached { ... }` não são gerenciadas. Depois de criar tasks não gerenciadas, você não pode controlá-las. Você não pode cancelá-las se a task da qual você as iniciou for cancelada. Você não pode saber se elas terminaram seu trabalho, se lançaram um erro, ou coletar seu valor de retorno. Iniciar tal task é como jogar uma garrafa no mar esperando que ela entregue sua mensagem ao destino, sem nunca ver essa garrafa de novo.

<div class="analogy">
<h4>O Prédio de Escritórios</h4>

Uma `Task` é como atribuir trabalho a um funcionário. O funcionário lida com a solicitação (incluindo esperar por outros escritórios) enquanto você continua com seu trabalho imediato.

Depois de despachar trabalho para o funcionário, você não tem meios de se comunicar com ela. Você não pode dizer para ela parar o trabalho ou saber se ela terminou e qual foi o resultado desse trabalho.

O que você realmente quer é dar ao funcionário um walkie-talkie para se comunicar com ela enquanto ela lida com a solicitação. Com o walkie-talkie, você pode dizer para ela parar, ou ela pode te dizer quando encontrar um erro, ou pode reportar o resultado da solicitação que você deu a ela.
</div>

Em vez de criar tasks não gerenciadas, use concorrência Swift para manter o controle das subtasks que você cria. Use `TaskGroup` para gerenciar (um grupo de) subtask(s). Swift fornece algumas funções `withTaskGroup() { group in ... }` para ajudar a criar grupos de tasks.

```swift
func doWork() async {

    // isso retornará quando todas as subtasks retornarem, lançarem um erro, ou forem canceladas
    let result = try await withThrowingTaskGroup() { group in
        group.addTask {
            try await self.performAsyncOperation1()
        }
        group.addTask {
            try await self.performAsyncOperation2()
        }
        // espere e colete os resultados das tasks aqui
    }
}

func performAsyncOperation1() async throws -> Int {
    return 1
}
func performAsyncOperation2() async throws -> Int {
    return 2
}
```

Para coletar os resultados das tasks filhas do grupo, você pode usar um loop for-await-in:

```swift
var sum = 0
for await result in group {
    sum += result
}
// sum == 3
```

Você pode aprender mais sobre [TaskGroup](https://developer.apple.com/documentation/swift/taskgroup) na documentação do Swift.

#### Nota sobre Tasks e SwiftUI.

Ao escrever uma UI, você frequentemente quer iniciar tasks assíncronas de um contexto síncrono. Por exemplo, você quer carregar uma imagem assincronamente como resposta a um toque em um elemento de UI. Iniciar tasks assíncronas de um contexto síncrono não é possível em Swift. Por isso você vê soluções envolvendo `Task { ... }`, que introduz tasks não gerenciadas.

Você não pode usar `TaskGroup` de um modifier síncrono do SwiftUI porque `withTaskGroup()` é uma função async também e suas funções relacionadas também são.

Como alternativa, SwiftUI oferece um modifier assíncrono que você pode usar para iniciar operações assíncronas. O modifier `.task { }`, que já mencionamos, aceita uma função `() async -> Void`, ideal para chamar outras funções `async`. Está disponível em toda `View`. É acionado antes da view aparecer e as tasks que ele cria são gerenciadas e vinculadas ao ciclo de vida da view, significando que as tasks são canceladas quando a view desaparece.

Voltando ao exemplo de tocar-para-carregar-uma-imagem: em vez de criar uma task não gerenciada para chamar uma função assíncrona `loadImage()` de uma função síncrona `.onTap() { ... }`, você pode alternar uma flag no gesto de tap e usar o modifier `task(id:)` para carregar imagens assincronamente quando o valor do `id` (a flag) mudar.

Aqui está um exemplo:

```swift
struct ContentView: View {

    @State private var shouldLoadImage = false

    var body: some View {
        Button("Clique Aqui!") {
            // alterna a flag
            shouldLoadImage = !shouldLoadImage
        }
        // a View gerencia a subtask
        // ela inicia antes da view ser exibida
        // e para quando a view é ocultada
        .task(id: shouldLoadImage) {
            // quando o valor da flag muda, SwiftUI reinicia a task
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

## [Cola Rápida: Referência](#glossary)

| Palavra-chave | O que faz |
|---------|--------------|
| `async` | Função pode pausar |
| `await` | Pause aqui até terminar |
| `Task { }` | Inicia trabalho async, herda contexto |
| `Task.detached { }` | Inicia trabalho async, sem contexto herdado |
| `@MainActor` | Roda na thread principal |
| `actor` | Tipo com estado mutável isolado |
| `nonisolated` | Opta por sair do isolamento do actor |
| `nonisolated(nonsending)` | Fica no executor do chamador |
| `Sendable` | Seguro para passar entre domínios de isolamento |
| `@concurrent` | Sempre roda em segundo plano (Swift 6.2+) |
| `#isolation` | Captura o isolamento do chamador como parâmetro |
| `async let` | Inicia trabalho paralelo |
| `TaskGroup` | Trabalho paralelo dinâmico |

  </div>
</section>

<section id="further-reading">
  <div class="container">

## [Leitura Adicional](#further-reading)

<div class="resources">
<h4>Blog do Matt Massicotte (Altamente Recomendado)</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - Terminologia essencial
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - O conceito central
- [When should you use an actor?](https://www.massicotte.org/actors/) - Guia prático
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - Por que mais simples é melhor
</div>

<div class="resources">
<h4>Recursos Oficiais da Apple</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

<div class="resources">
<h4>Ferramentas</h4>

- [Tuist](https://tuist.dev?utm_source=fuckingapproachableswiftconcurrency&utm_medium=website&utm_campaign=tools) - Desenvolva mais rápido com equipes e projetos maiores
</div>

  </div>
</section>

<section id="ai-skill">
  <div class="container">

## [Skill para Agentes IA](#ai-skill)

Quer que seu assistente de código IA entenda Swift Concurrency? Fornecemos um arquivo **[SKILL.md](/SKILL.md)** que empacota esses modelos mentais para agentes IA como Claude Code, Codex, Amp, OpenCode e outros.

<div class="tip">
<h4>O que é um Skill?</h4>

Um skill é um arquivo markdown que ensina conhecimentos especializados para agentes de código IA. Quando você adiciona o skill de Swift Concurrency ao seu agente, ele automaticamente aplica esses conceitos quando te ajuda a escrever código Swift assíncrono.
</div>

### Como Usar

Escolha seu agente e execute os comandos:

<div class="code-tabs">
  <div class="code-tabs-nav">
    <button class="active">Claude Code</button>
    <button>Codex</button>
    <button>Amp</button>
    <button>OpenCode</button>
  </div>
  <div class="code-tab-content active">

```bash
# Skill pessoal (todos os seus projetos)
mkdir -p ~/.claude/skills/swift-concurrency
curl -o ~/.claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Skill de projeto (apenas este projeto)
mkdir -p .claude/skills/swift-concurrency
curl -o .claude/skills/swift-concurrency/SKILL.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Instruções globais (todos os seus projetos)
curl -o ~/.codex/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Instruções de projeto (apenas este projeto)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Instruções de projeto (recomendado)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
  <div class="code-tab-content">

```bash
# Regras globais (todos os seus projetos)
mkdir -p ~/.config/opencode
curl -o ~/.config/opencode/AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
# Regras de projeto (apenas este projeto)
curl -o AGENTS.md https://fuckingapproachableswiftconcurrency.com/SKILL.md
```

  </div>
</div>

O skill inclui a analogia do Edifício de Escritórios, padrões de isolamento, guia de Sendable, erros comuns e tabelas de referência rápida. Seu agente usará esse conhecimento automaticamente quando você trabalhar com código Swift Concurrency.

  </div>
</section>
