---
layout: base.njk
title: Swift Concurrency Estupidamente Acessível
description: Um guia sem tretas sobre concorrência em Swift. Aprende async/await, actors, Sendable e MainActor com modelos mentais simples. Sem jargão, apenas explicações claras.
lang: pt-PT
dir: ltr
nav:
  async-await: Async/Await
  tasks: Tarefas
  execution: Isolamento
  sendable: Sendable
  putting-it-together: Resumo
  mistakes: Armadilhas
footer:
  madeWith: Feito com frustração e amor. Porque concorrência em Swift não tem de ser confusa.
  viewOnGitHub: Ver no GitHub
---

<section class="hero">
  <div class="container">
    <h1>Estupidamente Acessível<br><span class="accent">Swift Concurrency</span></h1>
    <p class="subtitle">Finalmente percebe async/await, Tasks, e porque é que o compilador não para de gritar contigo.</p>
    <p class="credit">Enorme agradecimento a <a href="https://www.massicotte.org/">Matt Massicotte</a> por tornar a concorrência em Swift compreensível. Compilado por <a href="https://pepicrft.me">Pedro Piñera</a>. Encontraste um erro? <a href="mailto:pedro@tuist.dev">pedro@tuist.dev</a></p>
    <p class="tribute">Na tradição de <a href="https://fuckingblocksyntax.com/">fuckingblocksyntax.com</a> e <a href="https://fuckingifcaseletsyntax.com/">fuckingifcaseletsyntax.com</a></p>
  </div>
</section>

<section id="async-await">
  <div class="container">

## [Código Assíncrono: async/await](#async-await)

A maior parte do que as apps fazem é esperar. Buscar dados de um servidor - esperar pela resposta. Ler um ficheiro do disco - esperar pelos bytes. Consultar uma base de dados - esperar pelos resultados.

Antes do sistema de concorrência do Swift, expressavas esta espera com callbacks, delegates, ou [Combine](https://developer.apple.com/documentation/combine). Funcionam, mas callbacks aninhados tornam-se difíceis de seguir, e o Combine tem uma curva de aprendizagem íngreme.

`async/await` dá ao Swift uma nova forma de lidar com esperas. Em vez de callbacks, escreves código que parece sequencial - pausa, espera e retoma. Por baixo, o runtime do Swift gere estas pausas de forma eficiente. Mas manter a tua app realmente responsiva enquanto esperas depende de *onde* o código corre, o que vamos cobrir mais tarde.

Uma **função async** é uma que pode precisar de pausar. Marcas com `async`, e quando a chamas, usas `await` para dizer "pausa aqui até isto acabar":

```swift
func fetchUser(id: Int) async throws -> User {
    let url = URL(string: "https://api.example.com/users/\(id)")!
    let (data, _) = try await URLSession.shared.data(from: url)  // Suspende aqui
    return try JSONDecoder().decode(User.self, from: data)
}

// A chamar
let user = try await fetchUser(id: 123)
// O código aqui corre depois de fetchUser completar
```

O teu código pausa em cada `await` - isto chama-se **suspensão**. Quando o trabalho termina, o teu código retoma exatamente onde parou. A suspensão dá ao Swift a oportunidade de fazer outro trabalho enquanto espera.

### Esperar por *todos*

E se precisares de buscar várias coisas? Podes fazer await uma a uma:

```swift
let avatar = try await fetchImage("avatar.jpg")
let banner = try await fetchImage("banner.jpg")
let bio = try await fetchBio()
```

Mas isto é lento - cada uma espera que a anterior termine. Usa `async let` para correr em paralelo:

```swift
func loadProfile() async throws -> Profile {
    async let avatar = fetchImage("avatar.jpg")
    async let banner = fetchImage("banner.jpg")
    async let bio = fetchBio()

    // As três estão a buscar em paralelo!
    return Profile(
        avatar: try await avatar,
        banner: try await banner,
        bio: try await bio
    )
}
```

Cada `async let` começa imediatamente. O `await` recolhe os resultados.

<div class="tip">
<h4>await precisa de async</h4>

Só podes usar `await` dentro de uma função `async`.
</div>

  </div>
</section>

<section id="tasks">
  <div class="container">

## [Gerir Trabalho: Tasks](#tasks)

Uma **[Task](https://developer.apple.com/documentation/swift/task)** é uma unidade de trabalho async que podes gerir. Escreveste funções async, mas uma Task é o que realmente as executa. É como inicias código async a partir de código síncrono, e dá-te controlo sobre esse trabalho: esperar pelo resultado, cancelar, ou deixar correr em background.

Digamos que estás a construir um ecrã de perfil. Carrega o avatar quando a view aparece usando o modificador [`.task`](https://developer.apple.com/documentation/swiftui/view/task(priority:_:)), que cancela automaticamente quando a view desaparece:

```swift
struct ProfileView: View {
    @State private var avatar: Image?

    var body: some View {
        avatar
            .task { avatar = await downloadAvatar() }
    }
}
```

Se os utilizadores podem alternar entre perfis, usa `.task(id:)` para recarregar quando a seleção muda:

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

Quando o utilizador carrega em "Guardar", cria uma Task manualmente:

```swift
Button("Guardar") {
    Task { await saveProfile() }
}
```

E se precisares de carregar o avatar, bio e estatísticas de uma vez? Usa um [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) para buscar em paralelo:

```swift
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { avatar = try await downloadAvatar(for: userID) }
    group.addTask { bio = try await fetchBio(for: userID) }
    group.addTask { stats = try await fetchStats(for: userID) }
    try await group.waitForAll()
}
```

As Tasks dentro de um grupo são **child tasks**, ligadas ao pai. Algumas coisas a saber:

- **O cancelamento propaga-se**: cancela o pai, e todos os filhos são cancelados também
- **Erros**: um erro lançado cancela os irmãos e relança, mas só quando consomes resultados com `next()`, `waitForAll()`, ou iteração
- **Ordem de conclusão**: os resultados chegam à medida que as tasks terminam, não na ordem em que as adicionaste
- **Espera por todos**: o grupo não retorna até que todos os filhos completem ou sejam cancelados

Isto é **[concorrência estruturada](https://developer.apple.com/videos/play/wwdc2021/10134/)**: trabalho organizado numa árvore que é fácil de perceber e limpar.

  </div>
</section>

<section id="execution">
  <div class="container">

## [Onde as Coisas Correm: De Threads a Domínios de Isolamento](#execution)

Até agora falámos de *quando* o código corre (async/await) e *como organizá-lo* (Tasks). Agora: **onde é que corre, e como o mantemos seguro?**

<div class="tip">
<h4>A maioria das apps só espera</h4>

A maior parte do código de apps é **I/O-bound**. Buscas dados da rede, *await* uma resposta, descodificas, e mostras. Se tens múltiplas operações de I/O para coordenar, recorres a *tasks* e *task groups*. O trabalho de CPU real é mínimo. A thread principal consegue lidar com isto porque `await` suspende sem bloquear.

Mas mais cedo ou mais tarde, terás **trabalho CPU-bound**: fazer parse de um ficheiro JSON gigante, processar imagens, correr cálculos complexos. Este trabalho não espera por nada externo. Só precisa de ciclos de CPU. Se o correres na thread principal, a tua UI congela. É aqui que "onde é que o código corre" realmente importa.
</div>

### O Mundo Antigo: Muitas Opções, Nenhuma Segurança

Antes do sistema de concorrência do Swift, tinhas várias formas de gerir execução:

| Abordagem | O que faz | Trade-offs |
|----------|--------------|-----------|
| [Thread](https://developer.apple.com/documentation/foundation/thread) | Controlo direto de threads | Baixo nível, propenso a erros, raramente necessário |
| [GCD](https://developer.apple.com/documentation/dispatch) | Dispatch queues com closures | Simples mas sem cancelamento, fácil causar explosão de threads |
| [OperationQueue](https://developer.apple.com/documentation/foundation/operationqueue) | Dependências de tarefas, cancelamento, KVO | Mais controlo mas verboso e pesado |
| [Combine](https://developer.apple.com/documentation/combine) | Streams reativos | Ótimo para streams de eventos, curva de aprendizagem íngreme |

Todos funcionavam, mas a segurança estava inteiramente nas tuas mãos. O compilador não conseguia ajudar se te esquecesses de dispatch para main, ou se duas queues acedessem aos mesmos dados simultaneamente.

### O Problema: Data Races

Um [data race](https://developer.apple.com/documentation/xcode/data-race) acontece quando duas threads acedem à mesma memória ao mesmo tempo, e pelo menos uma está a escrever:

```swift
var count = 0

DispatchQueue.global().async { count += 1 }
DispatchQueue.global().async { count += 1 }

// Comportamento indefinido: crash, corrupção de memória, ou valor errado
```

Data races são comportamento indefinido. Podem crashar, corromper memória, ou silenciosamente produzir resultados errados. A tua app funciona bem em testes, depois crasha aleatoriamente em produção. Ferramentas tradicionais como locks e semáforos ajudam, mas são manuais e propensas a erros.

<div class="warning">
<h4>Concorrência amplifica o problema</h4>

Quanto mais concorrente a tua app é, mais prováveis se tornam os data races. Uma app iOS simples pode safar-se com segurança de threads desleixada. Um servidor web a lidar com milhares de pedidos simultâneos vai crashar constantemente. É por isso que a segurança em tempo de compilação do Swift importa mais em ambientes de alta concorrência.
</div>

### A Mudança: De Threads para Isolamento

O modelo de concorrência do Swift faz uma pergunta diferente. Em vez de "em que thread é que isto deve correr?", pergunta: **"quem é que tem permissão para aceder a estes dados?"**

Isto é [isolamento](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/#Isolation). Em vez de fazer dispatch manual de trabalho para threads, declaras fronteiras à volta de dados. O compilador aplica estas fronteiras em tempo de build, não em runtime.

<div class="tip">
<h4>Por baixo do capô</h4>

Swift Concurrency é construído em cima de [libdispatch](https://github.com/swiftlang/swift-corelibs-libdispatch) (o mesmo runtime que GCD). A diferença é a camada de tempo de compilação: actors e isolamento são aplicados pelo compilador, enquanto o runtime lida com agendamento num [thread pool cooperativo](https://developer.apple.com/videos/play/wwdc2021/10254/) limitado ao número de cores do teu CPU.
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

Quando marcas algo com `@MainActor`, não estás a dizer "dispatch isto para a thread principal." Estás a dizer "isto pertence ao domínio de isolamento do main actor." O compilador garante que qualquer coisa que aceda a isto tem de estar no MainActor ou `await` para cruzar a fronteira.

<div class="tip">
<h4>Na dúvida, usa @MainActor</h4>

Para a maioria das apps, marcar os teus ViewModels com `@MainActor` é a escolha certa. Preocupações com performance são normalmente exageradas. Começa aqui, otimiza só se medires problemas reais.
</div>

**2. Actors**

Um [actor](https://developer.apple.com/documentation/swift/actor) protege o seu próprio estado mutável. Garante que só um pedaço de código pode aceder aos seus dados de cada vez:

```swift
actor BankAccount {
    var balance: Double = 0

    func deposit(_ amount: Double) {
        balance += amount  // Seguro: actor garante acesso exclusivo
    }
}

// De fora, tens de fazer await para cruzar a fronteira
await account.deposit(100)
```

**Actors não são threads.** Um actor é uma fronteira de isolamento. O runtime do Swift decide que thread realmente executa código do actor. Tu não controlas isso, e não precisas.

**3. Nonisolated**

Código marcado com [`nonisolated`](https://developer.apple.com/documentation/swift/nonisolated) opta por sair do isolamento do actor. Pode ser chamado de qualquer lugar sem `await`, mas não pode aceder ao estado protegido do actor:

```swift
actor BankAccount {
    var balance: Double = 0

    nonisolated func bankName() -> String {
        "Banco Acme"  // Sem estado do actor acedido, seguro chamar de qualquer lugar
    }
}

let name = account.bankName()  // Não precisa de await
```

<div class="tip">
<h4>Approachable Concurrency: Menos Fricção</h4>

[Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) simplifica o modelo mental com duas definições do Xcode:

- **`SWIFT_DEFAULT_ACTOR_ISOLATION`** = `MainActor`: Tudo corre no MainActor a menos que digas o contrário
- **`SWIFT_APPROACHABLE_CONCURRENCY`** = `YES`: Funções async `nonisolated` ficam no actor do chamador em vez de saltar para uma thread de background

Novos projetos do Xcode 26 têm ambos ativados por defeito. Quando precisas de trabalho intensivo de CPU fora da thread principal, usa `@concurrent`.

<pre><code class="language-swift">// Corre no MainActor (o defeito)
func updateUI() async { }

// Corre em thread de background (opt-in)
@concurrent func processLargeFile() async { }</code></pre>
</div>

<div class="analogy">
<h4>O Edifício de Escritórios</h4>

Pensa na tua app como um edifício de escritórios. Cada **domínio de isolamento** é um escritório privado com uma fechadura na porta. Só uma pessoa pode estar lá dentro de cada vez, a trabalhar com os documentos desse escritório.

- **`MainActor`** é a receção - onde todas as interações com clientes acontecem. Só há uma, e lida com tudo o que o utilizador vê.
- **tipos `actor`** são escritórios de departamento - Contabilidade, Jurídico, RH. Cada um protege os seus próprios documentos sensíveis.
- Código **`nonisolated`** é o corredor - espaço partilhado por onde qualquer um pode andar, mas não há documentos privados lá.

Não podes simplesmente invadir o escritório de alguém. Bates à porta (`await`) e esperas que te deixem entrar.
</div>

  </div>
</section>

<section id="sendable">
  <div class="container">

## [O Que Pode Cruzar Domínios de Isolamento: Sendable](#sendable)

Os domínios de isolamento protegem dados, mas eventualmente precisas de passar dados entre eles. Quando o fazes, o Swift verifica se é seguro.

Pensa nisto: se passares uma referência para uma classe mutável de um actor para outro, ambos os actors podem modificá-la simultaneamente. Isso é exatamente o data race que estamos a tentar prevenir. Então o Swift precisa de saber: estes dados podem ser partilhados com segurança?

A resposta é o protocolo [`Sendable`](https://developer.apple.com/documentation/swift/sendable). É um marcador que diz ao compilador "este tipo é seguro para passar entre fronteiras de isolamento":

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
    var count = 0  // Dois lugares a modificar isto = desastre
}
```

### Tornar Tipos Sendable

O Swift infere automaticamente `Sendable` para muitos tipos:

- **Structs e enums** com apenas propriedades `Sendable` são implicitamente `Sendable`
- **Actors** são sempre `Sendable` porque protegem o seu próprio estado
- **tipos `@MainActor`** são `Sendable` porque o MainActor serializa o acesso

Para classes, é mais difícil. Uma classe pode conformar a `Sendable` apenas se for `final` e todas as suas propriedades guardadas forem imutáveis:

```swift
final class APIConfig: Sendable {
    let baseURL: URL      // Imutável
    let timeout: Double   // Imutável
}
```

Se tiveres uma classe que é thread-safe por outros meios (locks, atomics), podes usar [`@unchecked Sendable`](https://developer.apple.com/documentation/swift/uncheckedsendable) para dizer ao compilador "confia em mim":

```swift
final class ThreadSafeCache: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String: Data] = [:]
}
```

<div class="warning">
<h4>@unchecked Sendable é uma promessa</h4>

O compilador não vai verificar thread safety. Se estiveres errado, vais ter data races. Usa com moderação.
</div>

<div class="tip">
<h4>Approachable Concurrency: Menos Fricção</h4>

Com [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), erros de Sendable tornam-se muito mais raros:

- Se o código não cruza fronteiras de isolamento, não precisas de Sendable
- Funções async ficam no actor do chamador em vez de saltar para uma thread de background
- O compilador é mais inteligente a detetar quando valores são usados de forma segura

Ativa definindo `SWIFT_DEFAULT_ACTOR_ISOLATION` para `MainActor` e `SWIFT_APPROACHABLE_CONCURRENCY` para `YES`. Novos projetos do Xcode 26 têm ambos ativados por defeito. Quando precisas de paralelismo, marca funções com `@concurrent` e aí pensa em Sendable.
</div>

<div class="analogy">
<h4>Fotocópias vs. Documentos Originais</h4>

De volta ao edifício de escritórios. Quando precisas de partilhar informação entre departamentos:

- **Fotocópias são seguras** - Se o Jurídico faz uma cópia de um documento e envia para a Contabilidade, ambos têm a sua própria cópia. Podem rabiscar nelas, modificá-las, o que quiserem. Sem conflito.
- **Contratos originais assinados têm de ficar no lugar** - Se dois departamentos pudessem ambos modificar o original, é o caos. Quem tem a versão real?

Tipos `Sendable` são como fotocópias: seguros de partilhar porque cada lugar recebe a sua própria cópia independente (tipos de valor) ou porque são imutáveis (ninguém os pode modificar). Tipos não-`Sendable` são como contratos originais: passá-los cria o potencial para modificações conflituantes.
</div>

  </div>
</section>

<section id="isolation-inheritance">
  <div class="container">

## [Como o Isolamento é Herdado](#isolation-inheritance)

Viste que os domínios de isolamento protegem dados, e Sendable controla o que cruza entre eles. Mas como é que o código acaba num domínio de isolamento em primeiro lugar?

Quando chamas uma função ou crias um closure, o isolamento flui através do teu código. Com [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), a tua app começa no [`MainActor`](https://developer.apple.com/documentation/swift/mainactor), e esse isolamento propaga-se para o código que chamas, a menos que algo o mude explicitamente. Compreender este fluxo ajuda-te a prever onde o código corre e porque é que o compilador às vezes se queixa.

### Chamadas de Funções

Quando chamas uma função, o seu isolamento determina onde corre:

```swift
@MainActor func updateUI() { }      // Corre sempre no MainActor
func helper() { }                    // Herda o isolamento do chamador
@concurrent func crunch() async { }  // Corre explicitamente fora do actor
```

Com [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency), a maior parte do teu código herda isolamento do `MainActor`. A função corre onde o chamador corre, a menos que opte explicitamente por sair.

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

É por isto que closures de ação de `Button` do SwiftUI podem atualizar `@State` com segurança: herdam isolamento do MainActor da view.

### Tasks

Uma `Task { }` herda isolamento do actor de onde é criada:

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

Normalmente é isto que queres. A task corre no mesmo actor que o código que a criou.

### Quebrar a Herança: Task.detached

Às vezes queres uma task que não herda nenhum contexto:

```swift
@MainActor
class ViewModel {
    func doHeavyWork() {
        Task.detached {
            // Sem isolamento de actor, corre no pool cooperativo
            let result = await self.expensiveCalculation()
            await MainActor.run {
                self.data = result  // Saltar de volta explicitamente
            }
        }
    }
}
```

<div class="warning">
<h4>Task.detached normalmente está errado</h4>

A equipa do Swift recomenda [Task.detached como último recurso](https://forums.swift.org/t/revisiting-when-to-use-task-detached/57929). Não herda prioridade, valores task-local, ou contexto de actor. A maior parte do tempo, `Task` normal é o que queres. Se precisares de trabalho intensivo de CPU fora do main actor, marca a função com `@concurrent` em vez disso.
</div>

<div class="analogy">
<h4>Andar Pelo Edifício</h4>

Quando estás no escritório da receção (MainActor), e chamas alguém para te ajudar, essa pessoa vem ao *teu* escritório. Herda a tua localização. Se criares uma task ("vai fazer isto por mim"), esse assistente também começa no teu escritório.

A única forma de alguém acabar num escritório diferente é se for explicitamente para lá: "Preciso de trabalhar na Contabilidade para isto" (`actor`), ou "Vou tratar disto no escritório de trás" (`@concurrent`).
</div>

  </div>
</section>

<section id="putting-it-together">
  <div class="container">

## [Juntando Tudo](#putting-it-together)

Vamos recuar e ver como todas as peças encaixam.

Swift Concurrency pode parecer muitos conceitos: `async/await`, `Task`, actors, `MainActor`, `Sendable`, domínios de isolamento. Mas há realmente só uma ideia no centro de tudo: **o isolamento é herdado por defeito**.

Com [Approachable Concurrency](https://www.swift.org/blog/swift-6.2-released/#approachable-concurrency) ativado, a tua app começa no [`MainActor`](https://developer.apple.com/documentation/swift/mainactor). Esse é o teu ponto de partida. A partir daí:

- Cada função que chamas **herda** esse isolamento
- Cada closure que crias **captura** esse isolamento
- Cada [`Task { }`](https://developer.apple.com/documentation/swift/task) que crias **herda** esse isolamento

Não tens de anotar nada. Não tens de pensar em threads. O teu código corre no `MainActor`, e o isolamento simplesmente propaga-se automaticamente pelo teu programa.

Quando precisas de sair dessa herança, fazes explicitamente:

- **`@concurrent`** diz "corre isto numa thread de background"
- **`actor`** diz "este tipo tem o seu próprio domínio de isolamento"
- **`Task.detached { }`** diz "começa do zero, não herda nada"

E quando passas dados entre domínios de isolamento, o Swift verifica se é seguro. É para isso que [`Sendable`](https://developer.apple.com/documentation/swift/sendable) serve: marcar tipos que podem cruzar fronteiras com segurança.

É isso. É o modelo todo:

1. **O isolamento propaga-se** do `MainActor` através do teu código
2. **Optas por sair explicitamente** quando precisas de trabalho de background ou estado separado
3. **Sendable guarda as fronteiras** quando dados cruzam entre domínios

Quando o compilador se queixa, está a dizer-te que uma destas regras foi violada. Rastreia a herança: de onde veio o isolamento? Onde é que o código está a tentar correr? Que dados estão a cruzar uma fronteira? A resposta normalmente é óbvia quando fazes a pergunta certa.

### Para Onde Ir a Partir Daqui

A boa notícia: não precisas de dominar tudo de uma vez.

**A maioria das apps só precisa do básico.** Marca os teus ViewModels com `@MainActor`, usa `async/await` para chamadas de rede, e cria `Task { }` quando precisares de iniciar trabalho async a partir de um toque de botão. É só isso. Isto cobre 80% das apps do mundo real. O compilador dir-te-á se precisares de mais.

**Quando precisares de trabalho paralelo**, recorre a `async let` para buscar múltiplas coisas de uma vez, ou [`TaskGroup`](https://developer.apple.com/documentation/swift/taskgroup) quando o número de tasks é dinâmico. Aprende a lidar com cancelamento de forma graciosa. Isto cobre apps com carregamento de dados complexo ou funcionalidades em tempo real.

**Padrões avançados vêm depois**, se alguma vez. Actors personalizados para estado mutável partilhado, `@concurrent` para processamento intensivo de CPU, compreensão profunda de `Sendable`. Isto é código de framework, Swift do lado do servidor, apps desktop complexas. A maioria dos developers nunca precisa deste nível.

<div class="tip">
<h4>Começa simples</h4>

Não otimizes para problemas que não tens. Começa com o básico, lança a tua app, e adiciona complexidade apenas quando tiveres problemas reais. O compilador vai guiar-te.
</div>

  </div>
</section>

<section id="mistakes">
  <div class="container">

## [Atenção: Erros Comuns](#mistakes)

### Pensar que async = background

```swift
// Isto AINDA bloqueia a thread principal!
@MainActor
func slowFunction() async {
    let result = expensiveCalculation()  // Trabalho síncrono = bloqueante
    data = result
}
```

`async` significa "pode pausar." O trabalho real ainda corre onde corre. Usa `@concurrent` (Swift 6.2) ou `Task.detached` para trabalho pesado de CPU.

### Criar demasiados actors

```swift
// Sobre-engenharia
actor NetworkManager { }
actor CacheManager { }
actor DataManager { }

// Melhor - a maioria das coisas pode viver no MainActor
@MainActor
class AppState { }
```

Só precisas de um actor personalizado quando tens estado mutável partilhado que não pode viver no `MainActor`. [A regra do Matt Massicotte](https://www.massicotte.org/actors/): introduz um actor apenas quando (1) tens estado não-`Sendable`, (2) operações nesse estado têm de ser atómicas, e (3) essas operações não podem correr num actor existente. Se não conseguires justificar, usa `@MainActor` em vez disso.

### Tornar tudo Sendable

Nem tudo precisa de cruzar fronteiras. Se estás a adicionar `@unchecked Sendable` em todo o lado, recua e pergunta se os dados realmente precisam de se mover entre domínios de isolamento.

### Usar MainActor.run quando não é preciso

```swift
// Desnecessário
Task {
    let data = await fetchData()
    await MainActor.run {
        self.data = data
    }
}

// Melhor - só marca a função com @MainActor
@MainActor
func loadData() async {
    self.data = await fetchData()
}
```

`MainActor.run` raramente é a solução certa. Se precisas de isolamento do MainActor, anota a função com `@MainActor` em vez disso. É mais claro e o compilador pode ajudar-te mais. Vê [a opinião do Matt sobre isto](https://www.massicotte.org/problematic-patterns/).

### Bloquear o thread pool cooperativo

```swift
// NUNCA faças isto - arrisca deadlock
func badIdea() async {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await doWork()
        semaphore.signal()
    }
    semaphore.wait()  // Bloqueia uma thread cooperativa!
}
```

O thread pool cooperativo do Swift tem threads limitadas. Bloquear uma com `DispatchSemaphore`, `DispatchGroup.wait()`, ou chamadas similares pode causar deadlocks. Se precisares de fazer bridge entre código sync e async, usa `async let` ou reestrutura para ficar completamente async.

### Criar Tasks desnecessárias

```swift
// Criação de Task desnecessária
func fetchAll() async {
    Task { await fetchUsers() }
    Task { await fetchPosts() }
}

// Melhor - usa concorrência estruturada
func fetchAll() async {
    async let users = fetchUsers()
    async let posts = fetchPosts()
    await (users, posts)
}
```

Se já estás num contexto async, prefere concorrência estruturada (`async let`, `TaskGroup`) em vez de criar `Task`s não estruturadas. Concorrência estruturada lida com cancelamento automaticamente e torna o código mais fácil de entender.

  </div>
</section>

<section id="glossary">
  <div class="container">

## [Folha de Consulta: Referência Rápida](#glossary)

| Palavra-chave | O que faz |
|---------|--------------|
| `async` | Função pode pausar |
| `await` | Pausa aqui até terminar |
| `Task { }` | Inicia trabalho async, herda contexto |
| `Task.detached { }` | Inicia trabalho async, sem contexto herdado |
| `@MainActor` | Corre na thread principal |
| `actor` | Tipo com estado mutável isolado |
| `nonisolated` | Opta por sair do isolamento do actor |
| `Sendable` | Seguro para passar entre domínios de isolamento |
| `@concurrent` | Corre sempre em background (Swift 6.2+) |
| `async let` | Inicia trabalho paralelo |
| `TaskGroup` | Trabalho paralelo dinâmico |

## Leitura Adicional

<div class="resources">
<h4>Blog do Matt Massicotte (Altamente Recomendado)</h4>

- [A Swift Concurrency Glossary](https://www.massicotte.org/concurrency-glossary) - Terminologia essencial
- [An Introduction to Isolation](https://www.massicotte.org/intro-to-isolation/) - O conceito central
- [When should you use an actor?](https://www.massicotte.org/actors/) - Orientação prática
- [Non-Sendable types are cool too](https://www.massicotte.org/non-sendable/) - Porque simples é melhor
</div>

<div class="resources">
<h4>Recursos Oficiais da Apple</h4>

- [Swift Concurrency Documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)
- [WWDC21: Meet async/await](https://developer.apple.com/videos/play/wwdc2021/10132/)
- [WWDC21: Protect mutable state with actors](https://developer.apple.com/videos/play/wwdc2021/10133/)
</div>

  </div>
</section>
