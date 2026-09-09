# ws-network architecture

A map for someone reading this codebase for the first time. It answers three
questions: what the layers are, who depends on whom, and where third-party
protocol libraries enter.

## The one rule that explains most of the design

`src/lib/WebSocketClient.ts` knows only about native WebSocket. Every other
protocol lives under `src/lib/protocols/<name>/` and is opt-in. A protocol
never gets imported into the native module.

MQTT goes one step further: this repo **never imports `mqtt`**. The caller
passes `mqtt.connect` in. That is the seam marked in every diagram below.

## Layer 1 — core contracts

`WebSocketClient` owns the plugin pipeline, listener registry, and RxJS
streams. `WebSocketClientAdapter` is the transport seam: one subclass per
transport or protocol.

```mermaid
classDiagram
    direction LR

    class IWebSocketClient {
        <<interface>>
        +status() number
        +connect() Promise~void~
        +disconnect() void
        +send(message) void
        +onMessage(cb, options) Unsubscribe
        +onError(cb, options) Unsubscribe
        +onClose(cb, options) Unsubscribe
        +onConnect(cb, options) Unsubscribe
    }

    class IWebSocketClientAdapter {
        <<interface>>
        +connect() Promise~void~
        +disconnect() void
        +send(data) void
        +onMessage(cb) void
        +onError(cb) void
        +onClose(cb) void
        +onConnect(cb) void
    }

    class IWebSocketPlugin {
        <<interface>>
        +name string
        +onBeforeConnect()
        +onAfterConnect()
        +onBeforeSend(data) string
        +onAfterSend()
        +onBeforeDisconnect()
        +onAfterDisconnect()
        +onMessage(data)
    }

    class WebSocketClientAdapter~T~ {
        <<abstract>>
        #client T
        +connect()* Promise~void~
        +disconnect()* void
        +send(data)* void
        +networkStatus()* number
    }

    class WebSocketClient~T~ {
        -client WebSocketClientAdapter~T~
        -plugins IWebSocketPlugin[]
        +messages$ Observable~string~
        +errors$ Observable~Error~
        +connected$ Observable~void~
        +closed$ Observable~void~
        +connect() Promise~void~
        +send(message) void
        +sendAsync(message) Promise~void~
        +addPlugin(plugin) void
        +status() number
    }

    class LoggingPlugin {
        +name string
    }

    class WindowWebSocketClientAdapter {
        -url string
        +networkStatus() number
    }

    class WindowWebSocketClient

    IWebSocketClient <|.. WebSocketClient
    IWebSocketClientAdapter <|.. WebSocketClientAdapter
    IWebSocketPlugin <|.. LoggingPlugin
    WebSocketClientAdapter <|-- WindowWebSocketClientAdapter
    WebSocketClient <|-- WindowWebSocketClient
    WebSocketClient o-- WebSocketClientAdapter : owns one
    WebSocketClient o-- IWebSocketPlugin : runs hooks
```

Read `WebSocketClient.connect()` once and the pipeline is clear:
`onBeforeConnect` hooks, then the adapter's `connect()`, then `onAfterConnect`.
A protocol facade that overrides `connect()` skips all of that — which is why
the MQTT facades do not override it.

## Layer 2 — the MQTT direct path

The adapter holds the injected client. `IMqttClient` is a structural contract,
not an import: whatever the caller passes only has to have this shape.

```mermaid
classDiagram
    direction TB

    class WebSocketClientAdapter~T~ {
        <<abstract>>
    }
    class WebSocketClient~T~

    class IMqttClient {
        <<interface>>
        +connected boolean
        +subscribe(topic, options, cb) unknown
        +unsubscribe(topic, options, cb) unknown
        +publish(topic, message, options, cb) unknown
        +end(force) unknown
        +on(event, listener) unknown
    }

    class MqttConnect~TOptions~ {
        <<type alias>>
        +call(url, options) IMqttClient
    }

    class PubSubAble~T~ {
        <<interface>>
        +subscriptions Record~string, T~
        +subscribe(topic, cb, options) void
        +unsubscribe(topic) void
        +publish(topic, message, options) void
        +isSubscribed(topic) boolean
    }

    class MqttSubscription {
        +filter string
        +callbacks Set~MqttMessageCallback~
        +options unknown
        +registered boolean
    }

    class MqttWebSocketClientAdapter~TOptions~ {
        -brokerURL string
        -connect MqttConnect~TOptions~
        -decoder TextDecoder
        -connecting Promise~void~
        +subscriptions Record~string, MqttSubscription~
        +connect() Promise~void~
        +disconnect() void
        +subscribe(topic, cb, options) void
        +unsubscribe(topic) void
        +publish(topic, message, options) void
        +networkStatus() number
        +send(data) void
    }

    class MqttWebSocketClient~TOptions~ {
        +publish(topic, message, options) void
        +subscribe(topic, cb, options) void
        +unsubscribe(topic) void
        +isSubscribed(topic) boolean
    }

    class isTopicMatch {
        <<function>>
        +match(filter, topic) boolean
    }

    WebSocketClientAdapter <|-- MqttWebSocketClientAdapter
    WebSocketClient <|-- MqttWebSocketClient
    PubSubAble <|.. MqttWebSocketClientAdapter
    MqttWebSocketClient *-- MqttWebSocketClientAdapter : constructs
    MqttWebSocketClientAdapter o-- IMqttClient : injected, never imported
    MqttWebSocketClientAdapter ..> MqttConnect : calls factory
    MqttWebSocketClientAdapter --> MqttSubscription : keyed by filter
    MqttWebSocketClientAdapter ..> isTopicMatch : routes one message event
```

Two things carry most of the behavior:

- **`isTopicMatch`** exists because MQTT delivers every message on a single
  `message` event. The adapter has to decide which subscription wants it.
  This is a reimplementation of broker-side matching, so the integration tier
  checks it against a real broker.
- **`MqttSubscription.registered`** exists because a subscription can be made
  before `connect()`. It is kept and registered once the connection is up.

## Where third-party libraries enter

This is the part that surprises people. The repo has no `mqtt` import.

```mermaid
flowchart TB
    subgraph caller["Caller's code (outside this repo)"]
        app["app code<br/>imports mqtt"]
    end

    subgraph repo["ws-network (never imports mqtt)"]
        direction TB
        core["WebSocketClient<br/>WebSocketClientAdapter"]
        mqttDirect["MqttWebSocketClient<br/>MqttWebSocketClientAdapter"]
        stomp["StompWebSocketClient<br/>(imports @stomp/stompjs)"]
        native["WindowWebSocketClient"]
    end

    broker[("MQTT broker")]

    app -->|"connect factory"| mqttDirect
    mqttDirect --> broker

    mqttDirect --> core
    stomp --> core
    native --> core
```

Consequences worth knowing before you change anything:

- `mqtt` is a **devDependency** pinned to `5.14.0`, used only to type-check the
  injection contract and to run the integration and browser tiers.
- The SharedWorker entrypoint is **not** shipped by this repo. It has to import
  `mqtt`, so it belongs to the caller. `test/browser-fixture/` holds the
  reference version.
- `@stomp/stompjs` is a real runtime dependency, which is the older pattern.
  STOMP is unfinished; mirror its names, not its behavior.
- In a browser bundle `mqtt` exposes only a **default** export, so
  `mqtt.connect`, never `import { connect }`.

## The public surface is deliberately small

Entry and exit interfaces are counted and kept low. Everything else is reached
by module path, not through the barrel, so internals stay changeable.

| Barrel | Count | Names |
|--------|-------|-------|
| `protocols/mqtt/index.ts` | 6 | 2 entry pairs (adapter, convenience client) + `MqttConnect`, `IMqttClient` |
| `protocols/stomp/index.ts` | 3 | client, adapter, adapter options |

Read it as two roles:

- **Entry** — what a caller constructs. Counted in `constructor + its options`
  pairs, never as loose types. MQTT ships two pairs: the adapter (composition,
  recommended) and the convenience client.
- **Exit** — what a caller injects. For MQTT that is `MqttConnect` (the slot
  `mqtt.connect` goes into) and `IMqttClient` (the shape it must return).

Subscription records and callback aliases stay internal. The barrel was 15
names, was narrowed to 4, and settled at 6 once the adapter was re-exported on
purpose: composition is the recommended path, so the adapter has to be part of
the public surface.

## Test tiers and what each one can prove

```mermaid
flowchart LR
    unit["Unit<br/>npm test<br/>in-file fakes"]
    integration["Integration<br/>npm run test:integration<br/>aedes over TCP"]
    unit -->|"logic and branches"| ok1["adapter, session,<br/>topic matching rules"]
    integration -->|"real protocol"| ok2["isTopicMatch vs a real broker,<br/>qos and retain, connect failure"]
```

A third tier — a real browser with a real SharedWorker — was built and then
rolled back with the MQTT worker path. It is what caught the browser build
using a default-only export, a bug the other two tiers cannot see. See
`README.md` "MQTT over a worker: not implemented" before rebuilding it.
